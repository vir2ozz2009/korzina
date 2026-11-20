import { ApiError } from "../../../src/shared/errors";
import { credential, sellerCookie } from "../../auth/cookies";
import { tokenHash } from "../../auth/tokens";
import { storefrontUrl } from "../storefront-url";
import { telegramSellerSession } from "./sessions";

export function customerTelegramId(session: { kind: string; subject: string }): string | undefined {
  if (session.kind !== "telegram") return undefined;
  return /^telegram:([0-9]+)$/.exec(session.subject)?.[1];
}

export async function canEnterCabinet(database: D1Database, telegramId: string | undefined, shopId: string) {
  if (!telegramId) return false;
  const membership = await database
    .withSession("first-primary")
    .prepare(`SELECT 1 FROM accounts a JOIN memberships m ON m.account_id=a.id
      WHERE a.telegram_id=? AND m.shop_id=? AND m.revoked_at IS NULL AND m.role IN ('owner','employee')`)
    .bind(telegramId, shopId)
    .first();
  return membership !== null;
}

export async function enterCabinet(database: D1Database, telegramId: string | undefined, shopId: string) {
  if (!telegramId) throw new ApiError("UNAUTHORIZED", "Войдите через Telegram");
  if (!(await canEnterCabinet(database, telegramId, shopId))) throw new ApiError("FORBIDDEN", "Нет доступа к магазину");
  return telegramSellerSession(database, telegramId);
}

export async function readCabinet(database: D1Database, request: Request, appEnv: string, slug?: string) {
  const token = credential(request, sellerCookie);
  if (!token) throw new ApiError("UNAUTHORIZED", "Войдите в кабинет");
  const rows = await database
    .withSession("first-primary")
    .prepare(`SELECT a.telegram_id AS telegramId, sh.id, sh.slug, sh.name, sh.status, m.role
      FROM seller_sessions s JOIN accounts a ON a.id=s.account_id
      LEFT JOIN memberships m ON m.account_id=a.id AND m.revoked_at IS NULL AND m.role IN ('owner','employee')
      LEFT JOIN shops sh ON sh.id=m.shop_id AND sh.status IN ('draft','active','paused')
      WHERE s.token_hash=? AND s.expires_at>? AND a.telegram_id IS NOT NULL ORDER BY sh.name, sh.id`)
    .bind(await tokenHash(token), Date.now())
    .all<{ telegramId: string; id: string | null; slug: string; name: string; status: string; role: string }>();
  const actor = rows.results[0];
  if (!actor) throw new ApiError("UNAUTHORIZED", "Войдите через Telegram");
  const shops = rows.results.flatMap(({ telegramId: _, id, ...shop }) =>
    id ? [{ id, ...shop, storefrontUrl: storefrontUrl(request.url, appEnv, shop.slug) }] : [],
  );
  const current = slug ? shops.find((shop) => shop.slug === slug) : shops[0];
  if (slug && !current) throw new ApiError("FORBIDDEN", "Нет доступа к магазину");
  return { telegramId: actor.telegramId, current: current ?? null, shops };
}
