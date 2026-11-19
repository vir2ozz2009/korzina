import { ApiError } from "../../../src/shared/errors";
import { digest } from "../../auth/tokens";
import type { SqlStatement } from "../create-shop";

const days = 7 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

export async function invitationToken(linkId: string, secret: string | undefined) {
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw new ApiError("AUTH_UNAVAILABLE", "Приглашения пока недоступны");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`korzina:owner-invite:v1:${linkId}`));
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function prepareOwnerInvite(
  shopId: string,
  secret: string | undefined,
  now: number,
  platformAllowed: boolean,
  reason = "",
): Promise<SqlStatement> {
  const linkId = crypto.randomUUID();
  return {
    sql: "INSERT INTO invitations(token_hash,shop_id,expires_at,link_id,platform_allowed,replacement_reason) VALUES(?,?,?,?,?,?)",
    params: [await digest(await invitationToken(linkId, secret)), shopId, now + days, linkId, +platformAllowed, reason],
  };
}
