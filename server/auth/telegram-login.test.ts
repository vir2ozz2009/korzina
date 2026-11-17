import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../index";
import { customerAuth } from "../modules/auth/routes";
import { settings } from "../shop/schema";
import { signedInitData } from "../testing/auth";
import { setupPlatform } from "../testing/platform";
import { encryptBotToken } from "./bot-token";

beforeAll(setupPlatform);
const token = "12345:korzina-synthetic-test-only";
const post = (path: string, initData: string) =>
  new Request(`https://demo.korzina.app${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ initData, bearer: true }),
  });
describe("Telegram → сессия", () => {
  it("продавец входит с токеном платформы; поддельные данные не создают аккаунт", async () => {
    const bindings = { ...env, PLATFORM_BOT_TOKEN: token };
    const bad = await app.fetch(
      post("/api/platform/auth/telegram", await signedInitData("another-test-token")),
      bindings,
    );
    expect(bad.status).toBe(401);
    const response = await app.fetch(post("/api/platform/auth/telegram", await signedInitData(token)), bindings);
    expect(response.status).toBe(200);
    const body = await response.json<{ token: string }>();
    expect(body.token).toMatch(/^[a-f0-9]{64}$/);
    const session = await app.fetch(
      new Request("https://demo.korzina.app/api/platform/auth/session", {
        headers: { Authorization: `Bearer ${body.token}` },
      }),
      bindings,
    );
    expect(session.status).toBe(200);
    expect((await session.json<{ accountId: string }>()).accountId).toBeTruthy();
  });
  it("покупатель проверяется ботом именно своего магазина и получает bearer-сессию", async () => {
    const initData = await signedInitData(token);
    const forged = await signedInitData("other-store-test-token");
    await runInDurableObject(env.SHOP.get(env.SHOP.idFromName("f4-telegram-customer")), async (_instance, ctx) => {
      const encryptionKey = "a1".repeat(32); // Synthetic fixture, never a deployed key.
      drizzle(ctx.storage)
        .insert(settings)
        .values({
          key: "telegram_bot_token",
          value: await encryptBotToken(token, "f4-telegram-customer", encryptionKey),
        })
        .run();
      const bindings = {
        shop: { id: "f4-telegram-customer", slug: "test", name: "Test", status: "active", plan: "base", createdAt: 0 },
        db: drizzle(ctx.storage),
        storage: ctx.storage,
        secrets: { ENCRYPTION_KEY: encryptionKey },
      };
      expect((await customerAuth.fetch(post("/telegram", forged), bindings)).status).toBe(401);
      const response = await customerAuth.fetch(post("/telegram", initData), bindings);
      expect(response.status).toBe(201);
      const body = await response.json<{ subject: string; kind: string; token: string }>();
      expect(body).toMatchObject({ subject: "telegram:12345", kind: "telegram" });
      const session = await customerAuth.fetch(
        new Request("https://demo.korzina.app/session", { headers: { Authorization: `Bearer ${body.token}` } }),
        bindings,
      );
      expect(session.status).toBe(200);
      expect(await session.json()).toMatchObject({ subject: body.subject });
    });
  });
});
