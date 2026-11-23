import { digest } from "../../auth/tokens";

type InvitationRow = {
  shop: string;
  usedBy: string | null;
  revokedAt: number | null;
  expiresAt: number;
  member: number;
};
type Rejection = "invalid" | "expired" | "revoked" | "used" | "member";
type Result = { state: Rejection } | { state: "accepted"; shop: string };

function outcome(row: InvitationRow, telegram: string, now: number): Result {
  if (row.revokedAt !== null) return { state: "revoked" };
  if (row.usedBy) {
    if (row.usedBy !== telegram) return { state: "used" };
    return row.member ? { state: "accepted", shop: row.shop } : { state: "revoked" };
  }
  if (row.expiresAt <= now) return { state: "expired" };
  return { state: row.member ? "member" : "invalid" };
}

export async function redeemStaffInvite(
  database: D1Database,
  options: { token: string; telegram: string; name: string; now: number; channel: { shop: string; bot: string } },
): Promise<Result> {
  const { token, telegram, name, now, channel } = options;
  const hash = await digest(token);
  const { bot, shop } = channel;
  const session = database.withSession("first-primary");
  const member = `EXISTS(SELECT 1 FROM memberships m JOIN accounts a ON a.id=m.account_id
    WHERE m.shop_id=staff_invitations.shop_id AND a.telegram_id=? AND m.revoked_at IS NULL)`;
  const eligible = `token_hash=? AND bot=? AND shop_id=? AND
    EXISTS(SELECT 1 FROM shops WHERE id=staff_invitations.shop_id AND status IN ('draft','active','paused'))`;
  const read = () =>
    session
      .prepare(`SELECT shop_id AS shop,used_by AS usedBy,expires_at AS expiresAt,
    revoked_at AS revokedAt,${member} AS member FROM staff_invitations WHERE ${eligible}`)
      .bind(telegram, hash, bot, shop)
      .first<InvitationRow>();
  const before = await read();
  if (!before) return { state: "invalid" };
  if (before.revokedAt !== null || before.usedBy || before.expiresAt <= now || before.member)
    return outcome(before, telegram, now);

  const operation = crypto.randomUUID();
  const [claimed] = await session.batch([
    database
      .prepare(`UPDATE staff_invitations SET used_by=?,redemption_id=?
      WHERE ${eligible} AND revoked_at IS NULL AND used_by IS NULL AND expires_at>? AND NOT ${member}`)
      .bind(telegram, operation, hash, bot, shop, now, telegram),
    database
      .prepare(`INSERT INTO accounts(id,telegram_id) SELECT ?,used_by FROM staff_invitations
      WHERE token_hash=? AND redemption_id=? ON CONFLICT(telegram_id) DO NOTHING`)
      .bind(crypto.randomUUID(), hash, operation),
    database
      .prepare(`INSERT INTO memberships(shop_id,account_id,role,team_role,permissions,display_name)
      SELECT i.shop_id,a.id,'employee',i.role,i.permissions,?
      FROM staff_invitations i JOIN accounts a ON a.telegram_id=i.used_by
      WHERE i.token_hash=? AND i.redemption_id=?
      ON CONFLICT(shop_id,account_id) DO UPDATE SET role='employee',team_role=excluded.team_role,
       permissions=excluded.permissions,display_name=excluded.display_name,revoked_at=NULL,version=memberships.version+1`)
      .bind(name || "Сотрудник", hash, operation),
    database
      .prepare(`INSERT INTO platform_audit(id,shop_id,actor_id,action,changed,created_at)
      SELECT ?,i.shop_id,a.id,'team.invite_accepted',json_object('role',i.role),?
      FROM staff_invitations i JOIN accounts a ON a.telegram_id=i.used_by WHERE i.token_hash=? AND i.redemption_id=?`)
      .bind(operation, now, hash, operation),
  ]);
  if (claimed.meta.changes === 1) return { state: "accepted", shop: before.shop };
  const after = await read();
  return after ? outcome(after, telegram, now) : { state: "invalid" };
}
