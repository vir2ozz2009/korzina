import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { tokenHash } from "../../auth/tokens";
import { app } from "../../index";
import { startExchange } from "../../modules/auth/telegram-exchange";
import { cookieFrom, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { demoPlatformShop, ensureDemoTelegramWebhook } from "./demo-telegram";

beforeAll(setupPlatform);
afterEach(vi.unstubAllGlobals);
const origin = "https://demo.korzina.app";
const endpoint = `${origin}/api/platform/telegram`;
const token = "77777:sample-only";
const secret = "unit-test-webhook-proof";
const bot = "korzina_test_bot";
const bindings = { ...env, PLATFORM_BOT_TOKEN: token, PLATFORM_BOT_WEBHOOK_SECRET: secret, PLATFORM_BOT_USERNAME: bot };

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
  const exchange = await runInDurableObject(stub, (_shop, { storage }) =>
    startExchange(storage, owner, undefined, async () => bot),
  );
  expect(new URL(exchange.url).searchParams.get("start")).toBe(exchange.exchange);
  const telegram = vi.fn(async () => Response.json({ ok: true, result: true }));
  vi.stubGlobal("fetch", telegram);
  const update = (proof: string) =>
    app.fetch(
      new Request(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": proof },
        body: JSON.stringify({
          message: { chat: { type: "private", id: 456712 }, from: { id: 456712 }, text: `/start ${exchange.exchange}` },
        }),
      }),
      bindings,
    );
  expect((await update("wrong")).status).toBe(403);
  expect(
    (await postAuth("/api/auth/telegram/finish", { exchange: exchange.exchange }, { Cookie: cookie })).status,
  ).toBe(202);
  expect((await update(secret)).status).toBe(200);
  expect(telegram).toHaveBeenCalledTimes(1);
  expect((await postAuth("/api/auth/telegram/finish", { exchange: exchange.exchange })).status).toBe(401);
  const authenticated = await postAuth(
    "/api/auth/telegram/finish",
    { exchange: exchange.exchange },
    { Cookie: cookie },
  );
  expect(authenticated.status).toBe(200);
  expect(await authenticated.json()).toMatchObject({ kind: "telegram", pending: false });
});
