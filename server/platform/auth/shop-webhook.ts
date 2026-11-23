import { exports } from "cloudflare:workers";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { ApiError } from "../../../src/shared/errors";
import { decryptBotToken } from "../../auth/bot-token";
import type { AuthSecrets } from "../../auth/config";
import { matchesTelegramSecret, telegramApi } from "../../auth/telegram-api";
import { answerBrowserLogin } from "../../auth/telegram-return";
import { shopBuyerExchange } from "../../modules/auth/telegram-exchange";
import { botWebhookSecret, managedBot, miniAppAddress } from "../admin/shop-bot";
import { connectStaffChat, staffConnectPattern } from "../team/bot";
import { answerStaffInvite, replyStaffChat, staffInvitePattern } from "../team/telegram";
import { browserCodePattern, confirmSellerExchange } from "./browser-exchange";
import { canEnterCabinet } from "./cabinet";
import { answerOwnerInvite, invitationPattern } from "./invitation-reply";

const telegramMessage = z.object({
  message: z.object({
    text: z.string().max(400).optional(),
    chat: z.object({ id: z.number().int(), type: z.literal("private") }),
    from: z.object({
      id: z.number().int().positive(),
      is_bot: z.literal(false).optional(),
      first_name: z.string().max(128).optional(),
      last_name: z.string().max(128).optional(),
    }),
  }),
});

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
    const start = text.startsWith("/start ") ? text.slice(7) : "";
    const raw = invitationPattern.exec(text)?.[1];
    const staff = staffInvitePattern.exec(text)?.[1];
    const staffShop = staffConnectPattern.exec(text)?.[1];
    if (raw)
      await answerOwnerInvite(c.env.PLATFORM, {
        raw,
        from,
        origin,
        bot: token,
        shopId,
        botKey: bot.telegramId,
      });
    else if (staff)
      await answerStaffInvite(c.env.PLATFORM, {
        raw: staff,
        from,
        origin,
        bot: token,
        channel: { shop: shopId, bot: bot.telegramId },
      });
    else if (staffShop === shopId) await replyStaffChat(c.env, shopId, bot.telegramId, from.id, token, origin);
    else if (browserCodePattern.test(start)) {
      const accepted = await confirmSellerExchange(c.env.PLATFORM, start, String(from.id), shopId, bot.telegramId);
      if (accepted) await connectStaffChat(c.env.PLATFORM, shopId, bot.telegramId, String(from.id));
      await answerBrowserLogin(token, chat.id, accepted?.return_url);
    } else if (shopBuyerExchange.test(start)) {
      const shop = exports.Shop.get(exports.Shop.idFromName(shopId));
      const name = [from.first_name, from.last_name].filter(Boolean).join(" ").slice(0, 100);
      const accepted = await shop.confirmBuyerTelegram(shopId, start, String(from.id), name);
      await answerBrowserLogin(token, chat.id, accepted && (accepted.return_url ?? miniAppAddress(origin, shopId)));
    } else if (text === "/start") {
      const seller = await canEnterCabinet(c.env.PLATFORM, String(from.id), shopId);
      if (seller) await connectStaffChat(c.env.PLATFORM, shopId, bot.telegramId, String(from.id));
      await telegramApi(token, "sendMessage", {
        chat_id: from.id,
        text: "Откройте витрину магазина",
        reply_markup: {
          inline_keyboard: [
            [{ text: "Открыть витрину", web_app: { url: miniAppAddress(origin, shopId) } }],
            ...(seller ? [[{ text: "Открыть кабинет", web_app: { url: miniAppAddress(origin, shopId, true) } }]] : []),
          ],
        },
      });
    }
    return c.json({ ok: true });
  },
);
