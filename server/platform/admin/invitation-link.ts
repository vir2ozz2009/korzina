import { ApiError } from "../../../src/shared/errors";
import { digest } from "../../auth/tokens";
import type { SqlStatement } from "../create-shop";

const days = 7 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const insertInvite = "INSERT INTO invitations(token_hash,shop_id,expires_at,link_id,replacement_reason)";

export type OwnerInvite = {
  linkId: string;
  expiresAt: number;
  usedBy: string | null;
  reason: string | null;
};

export function readOwnerInvite(database: D1Database, shopId: string) {
  return database
    .prepare(`SELECT link_id AS linkId, expires_at AS expiresAt, used_by AS usedBy,
      replacement_reason AS reason FROM invitations
      WHERE shop_id=? AND revoked_at IS NULL AND link_id IS NOT NULL ORDER BY rowid DESC LIMIT 1`)
    .bind(shopId);
}

export async function invitationToken(
  linkId: string,
  secret: string | undefined,
  purpose: "owner-invite" | "staff-invite" = "owner-invite",
) {
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw new ApiError("AUTH_UNAVAILABLE", "Приглашения пока недоступны");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`korzina:${purpose}:v1:${linkId}`));
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function prepareOwnerInvite(
  shopId: string,
  secret: string | undefined,
  now: number,
  reason = "",
): Promise<SqlStatement> {
  const { linkId, tokenHash, expiresAt } = await newOwnerInvite(secret, now);
  return {
    sql: `${insertInvite} VALUES(?,?,?,?,?)`,
    params: [tokenHash, shopId, expiresAt, linkId, reason],
  };
}

async function newOwnerInvite(secret: string | undefined, now: number) {
  const linkId = crypto.randomUUID();
  return { linkId, tokenHash: await digest(await invitationToken(linkId, secret)), expiresAt: now + days };
}

export async function ensureInitialOwnerInvite(
  database: D1Database,
  shopId: string,
  actorId: string,
  secret: string,
  now: number,
) {
  const { linkId, tokenHash, expiresAt } = await newOwnerInvite(secret, now);
  // Legacy shops may predate Telegram invitations. Never rotate a link or replace an owner on read.
  const [, , current] = await database.withSession("first-primary").batch<OwnerInvite>([
    database
      .prepare(`${insertInvite}
      SELECT ?, s.id, ?, ?, '' FROM shops s
      WHERE s.id=? AND s.status IN ('draft','active','paused')
      AND NOT EXISTS(SELECT 1 FROM invitations i WHERE i.shop_id=s.id AND i.link_id IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.shop_id=s.id AND m.role='owner' AND m.revoked_at IS NULL)`)
      .bind(tokenHash, expiresAt, linkId, shopId),
    database
      .prepare(`INSERT INTO platform_audit(id,shop_id,actor_id,action,changed,created_at)
      SELECT ?,shop_id,?,'owner.invite_issued','{}',? FROM invitations WHERE link_id=?`)
      .bind(crypto.randomUUID(), actorId, now, linkId),
    readOwnerInvite(database, shopId),
  ]);
  return current.results[0];
}
