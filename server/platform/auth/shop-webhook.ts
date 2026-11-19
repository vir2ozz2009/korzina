import { exports } from "cloudflare:workers";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ApiError } from "../../../src/shared/errors";
import { decryptBotToken } from "../../auth/bot-token";
import type { AuthSecrets } from "../../auth/config";
import { matchesTelegramSecret, telegramApi } from "../../auth/telegram-api";
import { answerBrowserLogin } from "../../auth/telegram-return";
import { shopBuyerExchange } from "../../modules/auth/telegram-exchange";
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
    else if (text.startsWith("/start ") && shopBuyerExchange.test(text.slice(7))) {
      const shop = exports.Shop.get(exports.Shop.idFromName(shopId));
      const name = [from.first_name, from.last_name].filter(Boolean).join(" ").slice(0, 100);
      const accepted = await shop.confirmBuyerTelegram(shopId, text.slice(7), String(from.id), name);
      await answerBrowserLogin(token, chat.id, accepted && (accepted.return_url ?? miniAppAddress(origin, shopId)));
    } else if (text === "/start") {
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
