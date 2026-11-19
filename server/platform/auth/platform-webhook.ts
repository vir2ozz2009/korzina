import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { matchesTelegramSecret, telegramApi } from "../../auth/telegram-api";
import { confirmSellerExchange } from "./browser-exchange";
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
    if (raw) {
      await answerOwnerInvite(c.env.PLATFORM, {
        raw,
        from,
        origin: new URL(c.req.url).origin,
        bot: token,
        platformBot: token,
      });
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
      await telegramApi(token, "sendMessage", {
        chat_id: chat.id,
        text: accepted
          ? "Вход подтверждён. Вернитесь в браузер."
          : "Ссылка для входа истекла. Начните заново в браузере.",
      });
    }
    return c.json({ ok: true });
  },
);
