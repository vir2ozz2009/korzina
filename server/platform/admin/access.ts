import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { credential } from "../../auth/cookies";
import { newToken, tokenHash } from "../../auth/tokens";
import { customerTtl } from "../../modules/auth/service";
import { scheduleSellerCleanup } from "../cleanup";

export const adminCookie = "korzina_admin";
const adminTtl = 12 * 60 * 60;
const forbidden = () => new ApiError("FORBIDDEN", "Нет доступа");

function listed(telegramId: string | undefined, ids: string | undefined) {
  return !!telegramId && (ids ?? "").split(/[,\s]+/).includes(telegramId);
}

export async function adminAccount(database: D1Database, secrets: AuthSecrets, telegramId?: string) {
  if (!listed(telegramId, secrets.PLATFORM_ADMIN_TELEGRAM_IDS) || !telegramId) return null;
  return database
    .withSession("first-primary")
    .prepare(`SELECT a.id FROM accounts a
    JOIN platform_admins p ON p.account_id=a.id WHERE a.telegram_id=?`)
    .bind(telegramId)
    .first<{ id: string }>();
}

export async function openAdminSession(
  database: D1Database,
  secrets: AuthSecrets,
  telegramId: string | undefined,
  b9ExpiresAt: number,
) {
  const account = await adminAccount(database, secrets, telegramId);
  if (!account) throw forbidden();
  const now = Date.now();
  const authAt = Math.min(now, b9ExpiresAt - customerTtl * 1000);
  const expiresAt = authAt + adminTtl * 1000;
  const ttl = Math.floor((expiresAt - now) / 1000);
  if (ttl <= 0) throw new ApiError("AUTH_FAILED", "Подтвердите вход через Telegram");
  const token = newToken();
  await database
    .prepare("INSERT INTO admin_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)")
    .bind(await tokenHash(token), account.id, expiresAt)
    .run();
  await scheduleSellerCleanup();
  return { token, ttl };
}

export async function requireAdmin(database: D1Database, secrets: AuthSecrets, request: Request) {
  const token = credential(request, adminCookie);
  if (!token) throw forbidden();
  const row = await database
    .withSession("first-primary")
    .prepare(`
    SELECT p.account_id AS id, a.telegram_id AS telegramId, s.expires_at AS expiresAt
    FROM admin_sessions s
    JOIN accounts a ON a.id=s.account_id
    JOIN platform_admins p ON p.account_id=s.account_id WHERE s.token_hash=?`)
    .bind(await tokenHash(token))
    .first<{ id: string; telegramId: string; expiresAt: number }>();
  if (!row || !listed(row.telegramId, secrets.PLATFORM_ADMIN_TELEGRAM_IDS)) throw forbidden();
  if (row.expiresAt <= Date.now()) throw new ApiError("AUTH_FAILED", "Подтвердите вход через Telegram");
  return row;
}

export async function revokeAdminSession(database: D1Database, request: Request) {
  const cookies = new Request(request.url, { headers: { Cookie: request.headers.get("Cookie") ?? "" } });
  const token = credential(cookies, adminCookie);
  if (token && /^[a-f0-9]{64}$/.test(token))
    await database
      .prepare("DELETE FROM admin_sessions WHERE token_hash=?")
      .bind(await tokenHash(token))
      .run();
}
