import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { TelegramRequestError, telegramApi } from "../../auth/telegram-api";
import { staffBot, staffBotToken } from "./bot";
import { activeOwner, type TeamCommand, teamReplay } from "./mutation";

type Delivery = { state: "sent" | "unavailable" | "unknown" };
function delivery(result: Delivery) {
  if (result.state === "unavailable") throw new ApiError("TELEGRAM_UNAVAILABLE", "Telegram временно недоступен");
  if (result.state === "unknown") throw new ApiError("DELIVERY_UNKNOWN", "Не удалось подтвердить доставку сообщения");
  return { sent: true as const };
}

export async function sendStaffTest(database: D1Database, secrets: AuthSecrets, context: TeamCommand, id: string) {
  const replay = await teamReplay<Delivery>(database, context);
  if (replay !== undefined) return delivery(replay);
  const bot = await staffBot(database, context.shop);
  if (!bot) throw new ApiError("AUTH_UNAVAILABLE", "Сначала администратор подключит бота");
  const token = await staffBotToken(bot, context.shop, secrets);
  const target = await database
    .withSession("first-primary")
    .prepare(`SELECT a.telegram_id AS chat,s.name,
    EXISTS(SELECT 1 FROM staff_bot_chats b WHERE b.shop_id=m.shop_id AND b.account_id=m.account_id AND b.bot=?) AS ready
    FROM memberships m JOIN accounts a ON a.id=m.account_id JOIN shops s ON s.id=m.shop_id
    WHERE m.shop_id=? AND m.account_id=? AND m.revoked_at IS NULL`)
    .bind(bot.id, context.shop, id)
    .first<{ chat: string | null; name: string; ready: number }>();
  if (!target) throw new ApiError("NOT_FOUND", "Запись не найдена");
  if (!target.chat || !target.ready) throw new ApiError("BOT_NOT_STARTED", "Сотруднику нужно открыть бота в Telegram");
  if (!token) throw new ApiError("TELEGRAM_UNAVAILABLE", "Telegram временно недоступен");
  const { actor, command, now, shop } = context;
  let result: Delivery = { state: "unknown" };
  const claim = await database
    .prepare(`INSERT OR IGNORE INTO platform_commands(account_id,key,fingerprint,result,created_at)
    SELECT ?,?,?,?,? WHERE ${activeOwner} AND EXISTS (
      SELECT 1 FROM memberships WHERE shop_id=? AND account_id=? AND revoked_at IS NULL
    )`)
    .bind(actor, command.key, command.fingerprint, JSON.stringify(result), now, shop, actor, shop, id)
    .run();
  if (claim.meta.changes !== 1) {
    const previous = await teamReplay<Delivery>(database, context);
    if (previous) return delivery(previous);
    throw new ApiError("NOT_FOUND", "Запись не найдена");
  }
  try {
    await telegramApi(token, "sendMessage", {
      chat_id: target.chat,
      text: `Тестовое уведомление магазина «${target.name}»`,
    });
    result = { state: "sent" };
  } catch (error) {
    if (
      (error instanceof TelegramRequestError && error.retryable) ||
      (error instanceof ApiError && error.code === "AUTH_FAILED")
    )
      result = { state: "unavailable" };
  }
  await database
    .prepare("UPDATE platform_commands SET result=? WHERE account_id=? AND key=?")
    .bind(JSON.stringify(result), actor, command.key)
    .run();
  return delivery(result);
}
