import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { encryptBotToken } from "../../auth/bot-token";
import type { AuthSecrets } from "../../auth/config";
import { telegramReturnUrl } from "../../auth/telegram-return";
import { tokenHash } from "../../auth/tokens";
import { app } from "../../index";
import { startExchange } from "../../modules/auth/telegram-exchange";
import { cookieFrom, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { botWebhookSecret } from "../admin/shop-bot";
import { startSellerExchange } from "./browser-exchange";
import { demoPlatformShop, ensureDemoTelegramWebhook } from "./demo-telegram";

beforeAll(setupPlatform);
afterEach(vi.unstubAllGlobals);
const origin = "https://demo.korzina.app";
const endpoint = `${origin}/api/platform/telegram`;
const token = "77777:sample-only";
const secret = "unit-test-webhook-proof";
const bot = "korzinaapp_demo_bot";
const bindings: Env & AuthSecrets = {
  ...env,
  PLATFORM_BOT_TOKEN: token,
  PLATFORM_BOT_WEBHOOK_SECRET: secret,
  PLATFORM_BOT_USERNAME: bot,
};

function botStart(url: string, proof: string, exchange: string, id = 456712, config: Env & AuthSecrets = bindings) {
  return app.fetch(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": proof },
      body: JSON.stringify({ message: { chat: { type: "private", id }, from: { id }, text: `/start ${exchange}` } }),
    }),
    config,
  );
}

it("проверяет имя бота и регистрирует HTTPS webhook только для новой конфигурации", async () => {
  const telegram = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = url.pathname.split("/").at(-1);
    if (method === "getMe") return Response.json({ ok: true, result: { username: bot, is_bot: true } });
    if (method === "setWebhook") {
      expect(JSON.parse(String(init?.body))).toEqual({
        url: endpoint,
        secret_token: secret,
        allowed_updates: ["message"],
      });
      return Response.json({ ok: true, result: true });
    }
    if (method === "getWebhookInfo") return Response.json({ ok: true, result: { url: endpoint } });
    throw new Error("Unexpected Telegram method");
  });
  vi.stubGlobal("fetch", telegram);
  await expect(
    ensureDemoTelegramWebhook(env.PLATFORM, { ...bindings, PLATFORM_BOT_USERNAME: "different_bot" }),
  ).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
  expect(telegram).toHaveBeenCalledTimes(1);
  await expect(ensureDemoTelegramWebhook(env.PLATFORM, bindings)).resolves.toBe(bot);
  await expect(ensureDemoTelegramWebhook(env.PLATFORM, bindings)).resolves.toBe(bot);
  expect(telegram).toHaveBeenCalledTimes(4);
});

it("подтверждает B9 на основной demo-витрине только через секрет webhook и исходный браузер", async () => {
  const guest = await postAuth("/api/auth/guest");
  const cookie = cookieFrom(guest);
  const owner = await tokenHash(cookie.split("=")[1]);
  const stub = exports.Shop.get(exports.Shop.idFromName(demoPlatformShop));
  const returnUrl = telegramReturnUrl(new Request(origin), "/cart?shop=lavka");
  const exchange = await runInDurableObject(stub, (_shop, { storage }) =>
    startExchange(storage, owner, undefined, async () => bot, returnUrl),
  );
  expect(new URL(exchange.url).searchParams.get("start")).toBe(exchange.exchange);
  const telegram = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ ok: true, result: true }),
  );
  vi.stubGlobal("fetch", telegram);
  const update = (proof: string) => botStart(endpoint, proof, exchange.exchange);
  expect((await update("wrong")).status).toBe(403);
  expect(
    (await postAuth("/api/auth/telegram/finish", { exchange: exchange.exchange }, { Cookie: cookie })).status,
  ).toBe(202);
  expect((await update(secret)).status).toBe(200);
  expect(telegram).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(telegram.mock.calls[0]?.[1]?.body))).toMatchObject({
    reply_markup: { inline_keyboard: [[{ url: `${origin}/cart?shop=lavka#telegram-return` }]] },
  });
  expect((await postAuth("/api/auth/telegram/finish", { exchange: exchange.exchange })).status).toBe(401);
  const authenticated = await postAuth(
    "/api/auth/telegram/finish",
    { exchange: exchange.exchange },
    { Cookie: cookie },
  );
  expect(authenticated.status).toBe(200);
  expect(await authenticated.json()).toMatchObject({ kind: "telegram", pending: false });
  // The browser can finish while Telegram is retrying delivery of its webhook.
  expect((await update(secret)).status).toBe(200);
  expect(JSON.parse(String(telegram.mock.calls[1]?.[1]?.body))).toMatchObject({
    reply_markup: { inline_keyboard: [[{ url: `${origin}/cart?shop=lavka#telegram-return` }]] },
  });
});

it("BL-5 · бот платформы возвращает продавца на исходный экран кабинета", async () => {
  const path = "/seller/more?store=test2&shop=lavka";
  const { exchange } = await startSellerExchange(env.PLATFORM, bot, telegramReturnUrl(new Request(origin), path, true));
  const telegram = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ ok: true, result: true }),
  );
  vi.stubGlobal("fetch", telegram);
  expect((await botStart(endpoint, secret, exchange)).status).toBe(200);
  expect(JSON.parse(String(telegram.mock.calls[0]?.[1]?.body))).toMatchObject({
    reply_markup: { inline_keyboard: [[{ url: `${origin}${path}#telegram-return` }]] },
  });
  expect((await botStart(endpoint, secret, exchange, 456713)).status).toBe(200);
  expect(JSON.parse(String(telegram.mock.calls[1]?.[1]?.body))).not.toHaveProperty("reply_markup");
});

it("BL-5 · бот магазина принимает свой одноразовый код и возвращает покупателя в исходный магазин", async () => {
  const shopId = "korzina-demo-test2";
  const telegramId = 77777;
  const ENCRYPTION_KEY = "be".repeat(32);
  const encrypted = await encryptBotToken(token, shopId, ENCRYPTION_KEY);
  await env.PLATFORM.prepare("INSERT INTO shop_bots(shop_id,telegram_id,username,token) VALUES(?,?,?,?)")
    .bind(shopId, String(telegramId), bot, encrypted)
    .run();
  const guest = await postAuth("/api/auth/guest?shop=test2");
  const Cookie = cookieFrom(guest);
  const startAuth = (returnPath: string) => postAuth("/api/auth/telegram/start?shop=test2", { returnPath }, { Cookie });
  expect((await startAuth("//external.test/cart")).status).toBe(400);
  expect((await startAuth("/api/platform/storefront/other")).status).toBe(400);
  const { exchange, url } = await (await startAuth("/favorites?shop=test2")).json<{ exchange: string; url: string }>();
  expect(new URL(url).searchParams.get("start")).toBe(exchange);

  const telegram = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ ok: true, result: true }),
  );
  vi.stubGlobal("fetch", telegram);
  const proof = await botWebhookSecret(ENCRYPTION_KEY, shopId, String(telegramId));
  const webhook = `${origin}/api/platform/shop-telegram/${shopId}`;
  expect((await botStart(webhook, proof, exchange, 456714, { ...bindings, ENCRYPTION_KEY })).status).toBe(200);
  expect(JSON.parse(String(telegram.mock.calls[0]?.[1]?.body))).toMatchObject({
    reply_markup: { inline_keyboard: [[{ url: `${origin}/favorites?shop=test2#telegram-return` }]] },
  });
  expect((await postAuth("/api/auth/telegram/finish?shop=test2", { exchange }, { Cookie })).status).toBe(200);
});
