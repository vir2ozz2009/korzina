import { type StaffAccess, type StaffInvite, staffPermissions, staffRole } from "../../../src/shared/contracts/staff";
import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { digest } from "../../auth/tokens";
import { invitationToken } from "../admin/invitation-link";
import { staffBot } from "./bot";
import { activeOwner, type TeamCommand, teamMutation, teamReplay } from "./mutation";

const lifetime = 7 * 86_400_000;
const fields = `id,role,bot_username AS botUsername,expires_at AS expiresAt,used_by AS usedBy,revoked_at AS revokedAt`;
type Invitation = {
  id: string;
  role: string;
  botUsername: string;
  expiresAt: number;
  usedBy: string | null;
  revokedAt: number | null;
};

function describeInvite(row: Invitation, now: number): StaffInvite {
  const state =
    row.revokedAt !== null ? "revoked" : row.usedBy ? "accepted" : row.expiresAt <= now ? "expired" : "pending";
  return { id: row.id, role: staffRole.parse(row.role), state, expiresAt: row.expiresAt };
}

async function staffLink(id: string, username: string, secret: string | undefined) {
  if (!/^[a-z][a-z0-9_]{4,31}$/i.test(username)) throw new ApiError("AUTH_UNAVAILABLE", "Бот пока недоступен");
  const token = await invitationToken(id, secret, "staff-invite");
  return { token, url: `https://t.me/${username}?start=staff_${token}` };
}

async function invite(database: D1Database, shop: string, id: string) {
  const result = await database
    .withSession("first-primary")
    .prepare(`SELECT ${fields} FROM staff_invitations WHERE shop_id=? AND id=?`)
    .bind(shop, id)
    .first<Invitation>();
  if (!result) throw new ApiError("NOT_FOUND", "Приглашение не найдено");
  return result;
}

export async function listStaffInvites(database: D1Database, shop: string, now: number, after = "") {
  const { results } = await database
    .withSession("first-primary")
    .prepare(`SELECT ${fields} FROM staff_invitations WHERE shop_id=? AND id>? ORDER BY id LIMIT 51`)
    .bind(shop, after)
    .all<Invitation>();
  const invites = results.slice(0, 50).map((row) => describeInvite(row, now));
  return { invites, next: results.length > 50 ? invites.at(-1)?.id : undefined };
}

export async function readStaffInvite(
  database: D1Database,
  shop: string,
  id: string,
  secret: string | undefined,
  now: number,
) {
  const row = await invite(database, shop, id);
  const result = describeInvite(row, now);
  if (result.state !== "pending") return result;
  return { ...result, url: (await staffLink(id, row.botUsername, secret)).url };
}

export async function createStaffInvite(
  database: D1Database,
  secrets: AuthSecrets,
  context: TeamCommand,
  access: StaffAccess,
) {
  const replay = await teamReplay<{ id: string }>(database, context);
  if (replay) return readStaffInvite(database, context.shop, replay.id, secrets.ENCRYPTION_KEY, context.now);
  const bot = await staffBot(database, context.shop, secrets);
  const username = (bot.isShop || secrets.PLATFORM_BOT_TOKEN) && bot.username;
  if (!username) throw new ApiError("AUTH_UNAVAILABLE", "Бот пока недоступен");
  const id = crypto.randomUUID();
  const { token } = await staffLink(id, username, secrets.ENCRYPTION_KEY);
  const mutation = database
    .prepare(`INSERT INTO staff_invitations
    (id,token_hash,shop_id,role,permissions,bot,bot_username,expires_at)
    SELECT ?,?,?,?,?,?,?,? WHERE ${activeOwner}`)
    .bind(
      id,
      await digest(token),
      context.shop,
      access.role,
      JSON.stringify(staffPermissions(access)),
      bot.id,
      username,
      context.now + lifetime,
      context.shop,
      context.actor,
    );
  const result = await teamMutation(database, context, mutation, "team.invite_created", { role: access.role }, { id });
  return readStaffInvite(database, context.shop, result.id, secrets.ENCRYPTION_KEY, context.now);
}

export async function revokeStaffInvite(database: D1Database, context: TeamCommand, id: string) {
  const replay = await teamReplay<StaffInvite>(database, context);
  if (replay) return replay;
  const before = describeInvite(await invite(database, context.shop, id), context.now);
  if (before.state !== "pending") throw new ApiError("VERSION_CONFLICT", "Приглашение уже недействительно");
  const mutation = database
    .prepare(`UPDATE staff_invitations SET revoked_at=?
    WHERE shop_id=? AND id=? AND revoked_at IS NULL AND used_by IS NULL AND expires_at>? AND ${activeOwner}`)
    .bind(context.now, context.shop, id, context.now, context.shop, context.actor);
  return teamMutation(database, context, mutation, "team.invite_revoked", { role: before.role }, {
    ...before,
    state: "revoked",
  } satisfies StaffInvite);
}
