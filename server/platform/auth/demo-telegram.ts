import { z } from "zod";
import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { telegramApi } from "../../auth/telegram-api";
import { digest } from "../../auth/tokens";

export const demoPlatformShop = "korzina-demo-lavka";
const demoOrigin = "https://demo.korzina.app";
const webhookUrl = `${demoOrigin}/api/platform/telegram`;
const settingsKey = "demo.telegram_webhook_fingerprint";
const unavailable = () => new ApiError("AUTH_UNAVAILABLE", "Бот платформы пока не настроен");

export function isDemoTelegramOrigin(request: Request) {
  return new URL(request.url).origin === demoOrigin;
}

let installation: { fingerprint: string; pending: Promise<void> } | undefined;

export async function ensureDemoTelegramWebhook(database: D1Database, secrets: AuthSecrets) {
  const {
    PLATFORM_BOT_TOKEN: token,
    PLATFORM_BOT_USERNAME: expectedUsername,
    PLATFORM_BOT_WEBHOOK_SECRET: secret,
  } = secrets;
  if (!token || !expectedUsername || !secret) throw unavailable();

  const fingerprint = await digest(JSON.stringify([webhookUrl, token, expectedUsername.toLowerCase(), secret]));
  const installed = await database
    .withSession("first-primary")
    .prepare("SELECT value FROM platform_settings WHERE key=?")
    .bind(settingsKey)
    .first<{ value: string }>();
  if (installed?.value === fingerprint) return expectedUsername;
  if (installation?.fingerprint === fingerprint) {
    await installation.pending;
    return expectedUsername;
  }

  const pending = (async () => {
    const bot = z
      .object({ username: z.string(), is_bot: z.literal(true) })
      .safeParse(await telegramApi(token, "getMe", {}));
    if (!bot.success || bot.data.username.toLowerCase() !== expectedUsername.toLowerCase()) throw unavailable();
    await telegramApi(token, "setWebhook", { url: webhookUrl, secret_token: secret, allowed_updates: ["message"] });
    const status = z.object({ url: z.literal(webhookUrl) }).safeParse(await telegramApi(token, "getWebhookInfo", {}));
    if (!status.success) throw unavailable();
    await database
      .prepare(`INSERT INTO platform_settings(key,value) VALUES(?,?) 
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .bind(settingsKey, fingerprint)
      .run();
  })();
  installation = { fingerprint, pending };
  try {
    await pending;
    return expectedUsername;
  } finally {
    if (installation?.pending === pending) installation = undefined;
  }
}
