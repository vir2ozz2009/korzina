import { ApiError } from "../../../src/shared/errors";
import { credential, sellerCookie } from "../../auth/cookies";
import { newToken, tokenHash } from "../../auth/tokens";
import { scheduleSellerCleanup } from "../cleanup";

export const sellerTtl = 7 * 86_400;
export async function sellerAccount(database: D1Database, request: Request): Promise<string> {
  const token = credential(request, sellerCookie);
  if (!token) throw new ApiError("UNAUTHORIZED", "Войдите в кабинет");
  const row = await database
    .withSession("first-primary")
    .prepare("SELECT account_id AS accountId FROM seller_sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await tokenHash(token), Date.now())
    .first<{ accountId: string }>();
  if (!row) throw new ApiError("UNAUTHORIZED", "Сессия недействительна");
  return row.accountId;
}
export async function telegramSellerSession(database: D1Database, telegramId: string): Promise<string> {
  const token = newToken();
  await database.batch([
    database
      .prepare("INSERT INTO accounts (id, telegram_id) VALUES (?, ?) ON CONFLICT(telegram_id) DO NOTHING")
      .bind(crypto.randomUUID(), telegramId),
    database
      .prepare(
        "INSERT INTO seller_sessions (token_hash, account_id, expires_at) SELECT ?, id, ? FROM accounts WHERE telegram_id = ?",
      )
      .bind(await tokenHash(token), Date.now() + sellerTtl * 1000, telegramId),
  ]);
  await scheduleSellerCleanup();
  return token;
}
export async function logoutSeller(database: D1Database, request: Request) {
  const token = credential(request, sellerCookie);
  if (token)
    await database
      .prepare("DELETE FROM seller_sessions WHERE token_hash = ?")
      .bind(await tokenHash(token))
      .run();
}
