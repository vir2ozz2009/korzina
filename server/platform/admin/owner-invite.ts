import { digest } from "../../auth/tokens";

type Result =
  | { state: "invalid" | "used" }
  | { state: "accepted"; shopId: string; name: string; previousOwner?: string };

export async function redeemOwnerInvite(
  database: D1Database,
  token: string,
  telegramId: string,
  name: string,
  channelShop: string,
): Promise<Result> {
  const hash = await digest(token);
  const now = Date.now();
  const invitation = await database
    .withSession("first-primary")
    .prepare(`SELECT i.shop_id AS shopId,
      i.used_by AS usedBy,s.name,i.revoked_at AS revokedAt,
      i.expires_at AS expiresAt,i.replacement_reason AS reason,
      (SELECT a.telegram_id FROM memberships m JOIN accounts a ON a.id=m.account_id
        WHERE m.shop_id=s.id AND m.role='owner' AND m.revoked_at IS NULL LIMIT 1) AS owner
    FROM invitations i JOIN shops s ON s.id=i.shop_id
    WHERE i.token_hash=? AND i.link_id IS NOT NULL AND s.status IN ('draft','active','paused')`)
    .bind(hash)
    .first<{
      shopId: string;
      name: string;
      usedBy: string | null;
      revokedAt: number | null;
      expiresAt: number;
      reason: string | null;
      owner: string | null;
    }>();
  if (!invitation || invitation.revokedAt || invitation.expiresAt <= now || channelShop !== invitation.shopId)
    return { state: "invalid" };
  const { shopId } = invitation;
  const accepted = { state: "accepted" as const, shopId, name: invitation.name };
  if (invitation.usedBy) {
    if (invitation.usedBy !== telegramId) return { state: "used" };
    return invitation.owner === telegramId ? accepted : { state: "invalid" };
  }
  if (invitation.owner && invitation.owner !== telegramId && !invitation.reason) return { state: "used" };

  const operation = crypto.randomUUID();
  const [claimed] = await database.batch([
    database
      .prepare(`UPDATE invitations SET used_by=?,redeemed_id=?
      WHERE token_hash=? AND used_by IS NULL AND revoked_at IS NULL AND expires_at>? AND
      (replacement_reason != '' OR NOT EXISTS(
        SELECT 1 FROM memberships m JOIN accounts a ON a.id=m.account_id
        WHERE m.shop_id=invitations.shop_id AND m.role='owner' AND m.revoked_at IS NULL AND a.telegram_id<>?
      ))`)
      .bind(telegramId, operation, hash, now, telegramId),
    database
      .prepare(`INSERT INTO accounts(id,telegram_id) SELECT ?,used_by FROM invitations WHERE redeemed_id=? AND token_hash=?
      ON CONFLICT(telegram_id) DO NOTHING`)
      .bind(crypto.randomUUID(), operation, hash),
    database
      .prepare(`UPDATE memberships SET revoked_at=? WHERE shop_id=? AND role='owner' AND revoked_at IS NULL
      AND account_id<>(SELECT id FROM accounts WHERE telegram_id=?)
      AND EXISTS(SELECT 1 FROM invitations WHERE token_hash=? AND redeemed_id=?)`)
      .bind(now, shopId, telegramId, hash, operation),
    database
      .prepare(`INSERT INTO memberships(shop_id,account_id,role) SELECT i.shop_id,a.id,'owner'
      FROM invitations i JOIN accounts a ON a.telegram_id=i.used_by WHERE i.token_hash=? AND i.redeemed_id=?
      ON CONFLICT(shop_id,account_id) DO UPDATE SET role='owner',team_role=NULL,permissions='[]',
        display_name=NULL,revoked_at=NULL,version=memberships.version+1`)
      .bind(hash, operation),
    database
      .prepare(`UPDATE shops SET owner_name=?,version=version+1
      WHERE id=? AND EXISTS(SELECT 1 FROM invitations WHERE token_hash=? AND redeemed_id=?)`)
      .bind(name || "Владелец Telegram", shopId, hash, operation),
    database
      .prepare(`INSERT INTO platform_audit(id,shop_id,actor_id,action,changed,created_at)
      SELECT ?,i.shop_id,a.id,'owner.invite_redeemed',?,?
      FROM invitations i JOIN accounts a ON a.telegram_id=i.used_by WHERE i.token_hash=? AND i.redeemed_id=?`)
      .bind(
        operation,
        JSON.stringify({ replacement: !!invitation.reason, reason: invitation.reason || undefined }),
        now,
        hash,
        operation,
      ),
  ]);
  if (claimed.meta.changes === 1) {
    const previousOwner = invitation.owner && invitation.owner !== telegramId ? invitation.owner : undefined;
    return { ...accepted, previousOwner };
  }
  const result = await database
    .withSession("first-primary")
    .prepare(`SELECT used_by AS usedBy,revoked_at AS revokedAt
    FROM invitations WHERE token_hash=?`)
    .bind(hash)
    .first<{ usedBy: string | null; revokedAt: number | null }>();
  if (result?.revokedAt || !result?.usedBy) return { state: "invalid" };
  return result.usedBy === telegramId ? accepted : { state: "used" };
}
