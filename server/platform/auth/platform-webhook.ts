import { exports } from "cloudflare:workers";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { matchesTelegramSecret, telegramApi } from "../../auth/telegram-api";
import { answerBrowserLogin, telegramReturnUrl } from "../../auth/telegram-return";
import { demoBuyerExchange } from "../../modules/auth/telegram-exchange";
import { platformStaffBot, staffConnectPattern } from "../team/bot";
import { answerStaffInvite, replyStaffChat, staffInvitePattern } from "../team/telegram";
import { confirmSellerExchange } from "./browser-exchange";
import { demoPlatformShop, isDemoTelegramOrigin } from "./demo-telegram";
import { answerOwnerInvite, invitationPattern } from "./invitation-reply";

export const telegramMessage = z.object({
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

export const platformWebhook = new Hono<{ Bindings: Env & AuthSecrets }>().post(
  "/",
  bodyLimit({ maxSize: 32_768 }),
  async (c) => {
    const token = c.env.PLATFORM_BOT_TOKEN;
    if (
      !token ||
      !(await matchesTelegramSecret(c.req.header("X-Telegram-Bot-Api-Secret-Token"), c.env.PLATFORM_BOT_WEBHOOK_SECRET))
    )
      throw new ApiError("FORBIDDEN", "Нет доступа");
    const parsed = telegramMessage.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ ok: true });
    const { chat, from, text } = parsed.data.message;
    if (chat.id !== from.id || !text) return c.json({ ok: true });
    const code = /^\/start (seller_[a-f0-9]{48})$/.exec(text)?.[1];
    const raw = invitationPattern.exec(text)?.[1];
    const staff = staffInvitePattern.exec(text)?.[1];
    const staffShop = staffConnectPattern.exec(text)?.[1];
    const purchase = /^\/start (purchase_demo_[a-f0-9]{32})$/.exec(text)?.[1];
    if (purchase && demoBuyerExchange.test(purchase) && c.env.APP_ENV === "demo" && isDemoTelegramOrigin(c.req.raw)) {
      const shop = exports.Shop.get(exports.Shop.idFromName(demoPlatformShop));
      const name = [from.first_name, from.last_name].filter(Boolean).join(" ").slice(0, 100);
      const accepted = await shop.confirmBuyerTelegram(demoPlatformShop, purchase, String(from.id), name);
      await answerBrowserLogin(token, chat.id, accepted && (accepted.return_url ?? telegramReturnUrl(c.req.raw)));
    } else if (raw) {
      await answerOwnerInvite(c.env.PLATFORM, {
        raw,
        from,
        origin: new URL(c.req.url).origin,
        bot: token,
        platformBot: token,
      });
    } else if (staff) {
      await answerStaffInvite(c.env.PLATFORM, { raw: staff, from, origin: new URL(c.req.url).origin, bot: token });
    } else if (staffShop) {
      await replyStaffChat(c.env, staffShop, platformStaffBot, from.id, token, new URL(c.req.url).origin);
    } else if (text === "/start") {
      const seller = await c.env.PLATFORM.withSession("first-primary")
        .prepare(`SELECT 1 FROM accounts a JOIN memberships m
        ON m.account_id=a.id WHERE a.telegram_id=? AND m.revoked_at IS NULL LIMIT 1`)
        .bind(String(from.id))
        .first();
      const url = new URL("/seller", c.req.url).href;
      await telegramApi(token, "sendMessage", {
        chat_id: from.id,
        text: seller
          ? "Откройте кабинет продавца"
          : "Чтобы получить магазин, попросите администратора прислать приглашение.",
        ...(seller && { reply_markup: { inline_keyboard: [[{ text: "Открыть кабинет", web_app: { url } }]] } }),
      });
    } else if (code) {
      const accepted = await confirmSellerExchange(c.env.PLATFORM, code, String(from.id));
      await answerBrowserLogin(
        token,
        chat.id,
        accepted && (accepted.return_url ?? telegramReturnUrl(c.req.raw, "/seller", true)),
      );
    }
    return c.json({ ok: true });
  },
);
