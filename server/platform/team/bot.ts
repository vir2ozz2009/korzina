import { ApiError } from "../../../src/shared/errors";
import { decryptBotToken } from "../../auth/bot-token";
import type { AuthSecrets } from "../../auth/config";
import { managedBot } from "../admin/shop-bot";

export const platformStaffBot = "platform";
export const staffConnectPattern = /^\/start staff_chat_([a-zA-Z0-9_-]{1,52})$/;

export async function staffBot(database: D1Database, shop: string, secrets: AuthSecrets) {
  const managed = await managedBot(database, shop);
  if (managed?.telegramId && managed.username && managed.token)
    return { id: managed.telegramId, username: managed.username, encrypted: managed.token, isShop: true as const };
  return { id: platformStaffBot, username: secrets.PLATFORM_BOT_USERNAME, isShop: false as const };
}

export function staffBotToken(bot: Awaited<ReturnType<typeof staffBot>>, shop: string, secrets: AuthSecrets) {
  return bot.isShop
    ? decryptBotToken(bot.encrypted, shop, secrets.ENCRYPTION_KEY)
    : Promise.resolve(secrets.PLATFORM_BOT_TOKEN);
}

export async function connectStaffChat(database: D1Database, shop: string, bot: string, telegram: string) {
  await database
    .prepare(`INSERT OR IGNORE INTO staff_bot_chats(shop_id,account_id,bot)
    SELECT m.shop_id,m.account_id,? FROM memberships m JOIN accounts a ON a.id=m.account_id
    WHERE m.shop_id=? AND a.telegram_id=? AND m.revoked_at IS NULL`)
    .bind(bot, shop, telegram)
    .run();
}

export async function staffBotStatus(database: D1Database, secrets: AuthSecrets, shop: string, account: string) {
  const bot = await staffBot(database, shop, secrets);
  const connected = await database
    .withSession("first-primary")
    .prepare("SELECT 1 FROM staff_bot_chats WHERE shop_id=? AND account_id=? AND bot=?")
    .bind(shop, account, bot.id)
    .first();
  const startedAnother =
    !connected &&
    (await database
      .withSession("first-primary")
      .prepare("SELECT 1 FROM staff_bot_chats WHERE shop_id=? AND account_id=? LIMIT 1")
      .bind(shop, account)
      .first());
  return {
    shopBot: bot.isShop ? bot.username : null,
    reconnect:
      startedAnother && bot.username && /^[a-z][a-z0-9_]{4,31}$/i.test(bot.username)
        ? `https://t.me/${bot.username}?start=staff_chat_${shop}`
        : undefined,
  };
}

export async function beginStaffChat(
  database: D1Database,
  secrets: AuthSecrets,
  shop: string,
  bot: string,
  telegram: string,
) {
  if ((await staffBot(database, shop, secrets)).id !== bot) throw new ApiError("FORBIDDEN", "Бот магазина сменился");
  await connectStaffChat(database, shop, bot, telegram);
}
