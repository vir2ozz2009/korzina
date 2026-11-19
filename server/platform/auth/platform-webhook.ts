import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { matchesTelegramSecret, telegramApi } from "../../auth/telegram-api";
import { confirmSellerExchange } from "./browser-exchange";

const telegramMessage = z.object({
  message: z.object({
    text: z.string().max(400).optional(),
    chat: z.object({ id: z.number().int(), type: z.literal("private") }),
    from: z.object({ id: z.number().int().positive(), is_bot: z.literal(false).optional() }),
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
    if (code) {
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
