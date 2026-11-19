import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ApiError } from "../../../src/shared/errors";
import { decryptBotToken } from "../../auth/bot-token";
import type { AuthSecrets } from "../../auth/config";
import { matchesTelegramSecret, telegramApi } from "../../auth/telegram-api";
import { botWebhookSecret, managedBot, miniAppAddress } from "../admin/shop-bot";
import { answerOwnerInvite, invitationPattern } from "./invitation-reply";
import { telegramMessage } from "./platform-webhook";

export const shopWebhook = new Hono<{ Bindings: Env & AuthSecrets }>().post(
  "/:id",
  bodyLimit({ maxSize: 32_768 }),
  async (c) => {
    const shopId = c.req.param("id");
    const auth = c.req.header("X-Telegram-Bot-Api-Secret-Token");
    if (!auth || !/^[0-9a-f]{64}$/.test(auth)) throw new ApiError("FORBIDDEN", "Нет доступа");
    const bot = await managedBot(c.env.PLATFORM, shopId);
    if (
      !bot?.token ||
      !bot.telegramId ||
      !(await matchesTelegramSecret(auth, await botWebhookSecret(c.env.ENCRYPTION_KEY, shopId, bot.telegramId)))
    )
      throw new ApiError("FORBIDDEN", "Нет доступа");
    const update = telegramMessage.safeParse(await c.req.json());
    if (!update.success) return c.json({ ok: true });
    const { chat, from, text } = update.data.message;
    if (chat.id !== from.id || !text) return c.json({ ok: true });
    const token = await decryptBotToken(bot.token, shopId, c.env.ENCRYPTION_KEY);
    const origin = new URL(c.req.url).origin;
    const raw = invitationPattern.exec(text)?.[1];
    if (raw)
      await answerOwnerInvite(c.env.PLATFORM, {
        raw,
        from,
        origin,
        bot: token,
        platformBot: c.env.PLATFORM_BOT_TOKEN,
        shopId,
      });
    else if (text === "/start") {
      await telegramApi(token, "sendMessage", {
        chat_id: from.id,
        text: "Откройте витрину магазина",
        reply_markup: {
          inline_keyboard: [[{ text: "Открыть витрину", web_app: { url: miniAppAddress(origin, shopId) } }]],
        },
      });
    }
    return c.json({ ok: true });
  },
);
