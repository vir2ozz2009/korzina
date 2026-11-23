import { z } from "zod";
import type { BotChange } from "../../../src/shared/contracts/admin";
import { ApiError } from "../../../src/shared/errors";
import { decryptBotToken, encryptBotToken } from "../../auth/bot-token";
import type { AuthSecrets } from "../../auth/config";
import { telegramApi } from "../../auth/telegram-api";
import { commitShopChange, prepareShopChange, type ShopMutation } from "./shop-change";

export const botCoordinator = "korzina-platform-bot-coordinator";
const botToken = /^\d{5,16}:[A-Za-z0-9_-]{16,100}$/;
const botDetails = z.object({
  id: z.number().positive().int(),
  is_bot: z.literal(true),
  username: z.string().regex(/^[a-z][a-z0-9_]{4,31}$/i),
});

export async function managedBot(database: D1Database | undefined, shopId: string) {
  return database
    ?.withSession("first-primary")
    .prepare(`SELECT telegram_id AS telegramId,username,token
    FROM shop_bots WHERE shop_id=?`)
    .bind(shopId)
    .first<{ telegramId: string | null; username: string | null; token: string | null }>();
}

export async function botWebhookSecret(secret: string | undefined, shopId: string, botId: string) {
  if (!secret) throw new ApiError("AUTH_UNAVAILABLE", "Telegram временно недоступен");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`korzina:store-webhook:v1:${shopId}:${botId}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function miniAppAddress(origin: string, shopId: string, cabinet = false) {
  const url = new URL(`/api/platform/storefront/${encodeURIComponent(shopId)}`, origin);
  if (cabinet) url.searchParams.set("destination", "seller");
  return url.href;
}

async function validateBot(token: string) {
  const invalid = () => new ApiError("TOKEN_INVALID", "Токен не подошёл");
  if (!botToken.test(token)) throw invalid();
  try {
    const details = botDetails.safeParse(await telegramApi(token, "getMe", {}));
    if (!details.success) throw invalid();
    return details.data;
  } catch (error) {
    if (error instanceof ApiError && error.code === "AUTH_FAILED") throw invalid();
    throw error;
  }
}

async function detachBot(secret: string | undefined, shopId: string, previous: Awaited<ReturnType<typeof managedBot>>) {
  if (!previous?.token) return;
  const token = await decryptBotToken(previous.token, shopId, secret);
  await telegramApi(token, "deleteWebhook", { drop_pending_updates: false });
  await telegramApi(token, "setChatMenuButton", { menu_button: { type: "default" } });
}

export async function changeShopBot(
  database: D1Database,
  secrets: AuthSecrets,
  mutation: ShopMutation,
  input: BotChange,
  origin: string,
) {
  const ready = await prepareShopChange(database, mutation);
  if (ready.replay) return ready.replay;
  const { shop } = ready;
  const previous = await managedBot(database, shop.id);
  if (input.action === "disconnect") {
    const result = await commitShopChange(database, mutation, {
      action: "bot.disconnected",
      changed: { previous: previous?.username ?? null },
      statements: [
        database
          .prepare(`INSERT INTO shop_bots(shop_id) VALUES(?) ON CONFLICT(shop_id)
          DO UPDATE SET telegram_id=NULL,username=NULL,token=NULL`)
          .bind(shop.id),
        database.prepare("UPDATE shops SET bot_username=NULL WHERE id=?").bind(shop.id),
      ],
    });
    await detachBot(secrets.ENCRYPTION_KEY, shop.id, previous).catch(() => {});
    return result;
  }

  const bot = await validateBot(input.token);
  const id = String(bot.id);
  const used = await database
    .withSession("first-primary")
    .prepare("SELECT shop_id FROM shop_bots WHERE telegram_id=? AND shop_id<>?")
    .bind(id, shop.id)
    .first();
  if (used) throw new ApiError("BOT_IN_USE", "Бот уже подключён к другому магазину");
  const encryptionKey = secrets.ENCRYPTION_KEY;
  if (!encryptionKey) throw new ApiError("AUTH_UNAVAILABLE", "Telegram временно недоступен");
  const encrypted = await encryptBotToken(input.token, shop.id, encryptionKey);
  const webhook = await botWebhookSecret(encryptionKey, shop.id, id);
  const webhookUrl = new URL(`/api/platform/shop-telegram/${shop.id}`, origin).href;
  let configured = false;
  try {
    await telegramApi(input.token, "setWebhook", {
      url: webhookUrl,
      secret_token: webhook,
      allowed_updates: ["message"],
    });
    configured = true;
    await telegramApi(input.token, "setChatMenuButton", {
      menu_button: { type: "web_app", text: "Открыть витрину", web_app: { url: miniAppAddress(origin, shop.id) } },
    });
    const result = await commitShopChange(database, mutation, {
      action: "bot.connected",
      changed: { previous: previous?.username ?? null, username: bot.username },
      statements: [
        database
          .prepare(`INSERT INTO shop_bots(shop_id,telegram_id,username,token) VALUES (?,?,?,?)
          ON CONFLICT(shop_id) DO UPDATE SET telegram_id=excluded.telegram_id,username=excluded.username,token=excluded.token`)
          .bind(shop.id, id, bot.username, encrypted),
        database.prepare("UPDATE shops SET bot_username=? WHERE id=?").bind(bot.username, shop.id),
      ],
    });
    if (previous?.telegramId && previous.telegramId !== id)
      await detachBot(encryptionKey, shop.id, previous).catch(() => {});
    return result;
  } catch (error) {
    if (configured && previous?.telegramId !== id) await telegramApi(input.token, "deleteWebhook", {}).catch(() => {});
    throw error;
  }
}
