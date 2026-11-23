import { ApiError } from "../../../src/shared/errors";
import { credential } from "../../auth/cookies";
import { digest, newToken, tokenHash } from "../../auth/tokens";
import { scheduleSellerCleanup } from "../cleanup";
import { sellerTtl } from "./sessions";

const ttl = 5 * 60;
export const browserCodePattern = /^seller_[a-f0-9]{48}$/;
const telegramUsername = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
const expired = () => new ApiError("AUTH_FAILED", "Ссылка для входа истекла");
const proofCookie = (hash: string) => `korzina_seller_proof_${hash.slice(0, 16)}`;

export async function startSellerExchange(
  database: D1Database,
  shopId: string,
  bot: { id: string; username: string },
  returnUrl: string,
) {
  if (!telegramUsername.test(bot.username))
    throw new ApiError("AUTH_UNAVAILABLE", "Telegram магазина пока не подключён");
  const exchange = `seller_${newToken().slice(0, 48)}`;
  const proof = newToken();
  const [id, hash] = await Promise.all([digest(exchange), tokenHash(proof)]);
  const expiresAt = Date.now() + ttl * 1000;
  await database
    .prepare("INSERT INTO seller_exchanges(id,proof_hash,expires_at,return_url,shop_id,bot_id) VALUES(?,?,?,?,?,?)")
    .bind(id, hash, expiresAt, returnUrl, shopId, bot.id)
    .run();
  await scheduleSellerCleanup();
  return {
    exchange,
    url: `https://t.me/${bot.username}?start=${exchange}`,
    expiresAt,
    cookie: { name: proofCookie(id), value: proof, ttl },
  };
}

export async function confirmSellerExchange(
  database: D1Database,
  exchange: string,
  telegramId: string,
  shopId: string,
  botId: string,
) {
  if (!browserCodePattern.test(exchange)) return undefined;
  return (
    (await database
      .prepare(`UPDATE seller_exchanges SET telegram_id=?
    WHERE id=? AND shop_id=? AND bot_id=? AND expires_at>? AND (telegram_id IS NULL OR telegram_id=?)
    AND EXISTS (SELECT 1 FROM accounts a JOIN memberships m ON m.account_id=a.id
      WHERE a.telegram_id=? AND m.shop_id=seller_exchanges.shop_id AND m.revoked_at IS NULL
      AND m.role IN ('owner','employee')) RETURNING return_url`)
      .bind(telegramId, await digest(exchange), shopId, botId, Date.now(), telegramId, telegramId)
      .first<{ return_url: string | null }>()) ?? undefined
  );
}

export async function finishSellerExchange(database: D1Database, request: Request, exchange: string) {
  const id = await digest(exchange);
  const name = proofCookie(id);
  const proof = credential(request, name);
  if (!proof) throw expired();
  const proofHash = await tokenHash(proof);
  const now = Date.now();
  const active = "id=? AND shop_id IS NOT NULL AND proof_hash=? AND expires_at>? AND completed_with IS NULL";
  const row = await database
    .withSession("first-primary")
    .prepare(`SELECT telegram_id AS telegramId FROM seller_exchanges WHERE ${active}`)
    .bind(id, proofHash, now)
    .first<{ telegramId: string | null }>();
  if (!row) throw expired();
  if (!row.telegramId) return undefined;
  const token = newToken();
  const session = await tokenHash(token);
  const [consumed, created] = await database.batch([
    database
      .prepare(`UPDATE seller_exchanges SET completed_with=? WHERE ${active} AND telegram_id=?`)
      .bind(session, id, proofHash, now, row.telegramId),
    database
      .prepare(`INSERT INTO seller_sessions(token_hash,account_id,expires_at,shop_id)
      SELECT completed_with, a.id, ?, e.shop_id FROM seller_exchanges e JOIN accounts a ON a.telegram_id=e.telegram_id
      WHERE e.id=? AND e.completed_with=?`)
      .bind(now + sellerTtl * 1000, id, session),
  ]);
  if (consumed.meta.changes !== 1 || created.meta.changes !== 1) throw expired();
  await scheduleSellerCleanup();
  return { token, name };
}
