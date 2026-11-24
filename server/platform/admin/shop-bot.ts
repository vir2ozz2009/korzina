import { z } from "zod";
import type { BotChange } from "../../../src/shared/contracts/admin";
import { ApiError } from "../../../src/shared/errors";
import { decryptBotToken, encryptBotToken } from "../../auth/bot-token";
import type { AuthSecrets } from "../../auth/config";
import { TelegramApiError, telegramApi, telegramRequest } from "../../auth/telegram-api";
import { commitShopChange, prepareShopChange, type ShopMutation } from "./shop-change";

export const botCoordinator = "korzina-platform-bot-coordinator";
const botToken = /^\d{5,16}:[A-Za-z0-9_-]{16,100}$/;
const botDetails = z.object({
  id: z.number().positive().int(),
  is_bot: z.literal(true),
  username: z.string().regex(/^[a-z][a-z0-9_]{4,31}$/i),
});
type ConnectStage = "getMe" | "prepare_encryption_key" | "setWebhook" | "setChatMenuButton" | "save_binding";

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
  if (!botToken.test(token)) throw new ApiError("TOKEN_INVALID", "Токен не подошёл");
  const { result, httpStatus } = await telegramRequest(token, "getMe", {});
  const details = botDetails.safeParse(result);
  if (!details.success) throw new TelegramApiError({ kind: "invalid_response", httpStatus }, "TOKEN_INVALID");
  return details.data;
}

async function configureBot(token: string, method: "setWebhook" | "setChatMenuButton", body: object) {
  const { result, httpStatus } = await telegramRequest(token, method, body);
  if (result !== true) throw new TelegramApiError({ kind: "invalid_response", httpStatus });
}

function logConnectFailure(shopId: string, stage: ConnectStage, error: unknown) {
  // Telegram URLs contain the bot token. Keep the log limited to controlled fields.
  console.error(
    JSON.stringify({
      event: "shop_bot_connect_failed",
      shopId,
      stage,
      code: error instanceof ApiError ? error.code : "INTERNAL",
      ...(error instanceof TelegramApiError ? error.failure : {}),
    }),
  );
}

async function detachBot(secret: string | undefined, shopId: string, previous: Awaited<ReturnType<typeof managedBot>>) {
  if (!previous?.token) return;
  const token = await decryptBotToken(previous.token, shopId, secret);
  await telegramApi(token, "deleteWebhook", { drop_pending_updates: false });
  await telegramApi(token, "setChatMenuButton", { menu_button: { type: "default" } });
}

async function disconnectBot(
  database: D1Database,
  mutation: ShopMutation,
  key: string | undefined,
  previous: Awaited<ReturnType<typeof managedBot>>,
) {
  const result = await commitShopChange(database, mutation, {
    action: "bot.disconnected",
    changed: { previous: previous?.username ?? null },
    statements: [
      database
        .prepare(`INSERT INTO shop_bots(shop_id) VALUES(?) ON CONFLICT(shop_id)
          DO UPDATE SET telegram_id=NULL,username=NULL,token=NULL`)
        .bind(mutation.id),
      database.prepare("UPDATE shops SET bot_username=NULL WHERE id=?").bind(mutation.id),
    ],
  });
  await detachBot(key, mutation.id, previous).catch(() => {});
  return result;
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
  const shopId = ready.shop.id;
  const encryptionKey = secrets.ENCRYPTION_KEY;
  let stage: ConnectStage = "save_binding";
  let rollbackWebhook: (() => Promise<unknown>) | undefined;
  try {
    const previous = await managedBot(database, shopId);
    if (input.action === "disconnect") return await disconnectBot(database, mutation, encryptionKey, previous);

    const { token } = input;
    stage = "getMe";
    const bot = await validateBot(token);
    const id = String(bot.id);

    stage = "save_binding";
    const used = await database
      .withSession("first-primary")
      .prepare("SELECT shop_id FROM shop_bots WHERE telegram_id=? AND shop_id<>?")
      .bind(id, shopId)
      .first();
    if (used) throw new ApiError("BOT_IN_USE", "Бот уже подключён к другому магазину");

    stage = "prepare_encryption_key";
    if (!encryptionKey) throw new ApiError("AUTH_UNAVAILABLE", "Telegram временно недоступен");
    const encrypted = await encryptBotToken(token, shopId, encryptionKey);
    const webhook = await botWebhookSecret(encryptionKey, shopId, id);

    stage = "setWebhook";
    await configureBot(token, stage, {
      url: new URL(`/api/platform/shop-telegram/${shopId}`, origin).href,
      secret_token: webhook,
      allowed_updates: ["message"],
    });
    if (previous?.telegramId !== id) rollbackWebhook = () => telegramApi(token, "deleteWebhook", {});

    stage = "setChatMenuButton";
    await configureBot(token, stage, {
      menu_button: { type: "web_app", text: "Открыть витрину", web_app: { url: miniAppAddress(origin, shopId) } },
    });

    stage = "save_binding";
    const result = await commitShopChange(database, mutation, {
      action: "bot.connected",
      changed: { previous: previous?.username ?? null, username: bot.username },
      statements: [
        database
          .prepare(`INSERT INTO shop_bots(shop_id,telegram_id,username,token) VALUES (?,?,?,?)
          ON CONFLICT(shop_id) DO UPDATE SET telegram_id=excluded.telegram_id,username=excluded.username,token=excluded.token`)
          .bind(shopId, id, bot.username, encrypted),
        database.prepare("UPDATE shops SET bot_username=? WHERE id=?").bind(bot.username, shopId),
      ],
    });
    if (previous?.telegramId && previous.telegramId !== id)
      await detachBot(encryptionKey, shopId, previous).catch(() => {});
    return result;
  } catch (error) {
    if (input.action === "connect") logConnectFailure(shopId, stage, error);
    await rollbackWebhook?.().catch(() => {});
    if (stage === "getMe" && error instanceof TelegramApiError && error.code === "AUTH_FAILED")
      throw new ApiError("TOKEN_INVALID", error.message);
    throw error;
  }
}
