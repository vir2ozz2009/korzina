import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { Hono } from "hono";
import { beforeAll, expect, it, vi } from "vitest";
import { app } from "../../index";
import { handleError } from "../../middleware/errors";
import { profileRoutes } from "../../modules/profile/routes";
import { cookieFrom, getAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { botFixtureKey, setShopBot } from "../../testing/shop-bot";
import { botWebhookSecret } from "../admin/shop-bot";

const shops = [
  { id: "korzina-demo-lavka", slug: "lavka", bot: "94010" },
  { id: "korzina-demo-test2", slug: "test2", bot: "94011" },
] as const;
const [a, b] = shops;
const origin = "https://demo.korzina.app";
const bindings = { ...env, ENCRYPTION_KEY: botFixtureKey, PLATFORM_ADMIN_TELEGRAM_IDS: "94600" };
const sellerPath = "/api/seller/cabinet";
const buyerPath = (action: string) => `/api/auth/telegram/${action}?shop=${a.slug}`;

beforeAll(async () => {
  await setupPlatform();
  for (const shop of shops) await setShopBot(env.PLATFORM, shop.id, shop.bot);
  await env.PLATFORM.batch([
    env.PLATFORM.prepare("INSERT INTO accounts(id,telegram_id) VALUES('seller','94500')"),
    ...shops.map(({ id }) =>
      env.PLATFORM.prepare("INSERT INTO memberships(shop_id,account_id,role) VALUES(?,'seller','owner')").bind(id),
    ),
  ]);
});

const post = (path: string, body: unknown, headers?: Record<string, string>) =>
  app.fetch(
    new Request(origin + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...headers },
      body: JSON.stringify(body),
    }),
    bindings,
  );

async function webhook(channel: (typeof shops)[number], code: string, telegram: number, secretChannel = channel) {
  return post(
    `/api/platform/shop-telegram/${channel.id}`,
    {
      message: {
        text: `/start ${code}`,
        chat: { type: "private", id: telegram },
        from: { id: telegram, username: "94600" },
      },
    },
    { "X-Telegram-Bot-Api-Secret-Token": await botWebhookSecret(botFixtureKey, secretChannel.id, secretChannel.bot) },
  );
}

it("BOT1.6 · webhook магазина Б не подтверждает коды входа продавца и покупателя магазина А", async () => {
  const send = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ ok: true, result: true }));
  try {
    const sellerStart = await post(`${sellerPath}/start`, { store: a.slug });
    expect(sellerStart.status).toBe(201);
    const buyerStart = await post(buyerPath("start"), {});
    expect(buyerStart.status).toBe(200);

    for (const [started, finishPath, telegram] of [
      [sellerStart, `${sellerPath}/finish`, 94500],
      [buyerStart, buyerPath("finish"), 94600],
    ] as const) {
      const { url, exchange } = await started.json<{ url: string; exchange: string }>();
      expect(url).toBe(`https://t.me/KorzinaFixture${a.bot}Bot?start=${exchange}`);
      const finish = () => post(finishPath, { exchange }, { Cookie: cookieFrom(started) });
      expect((await webhook(a, exchange, telegram, b)).status).toBe(403);
      expect((await webhook(b, exchange, telegram)).status).toBe(200);
      expect(await (await finish()).json()).toEqual({ pending: true });
      expect(send.mock.calls.at(-1)?.[0]).toBe(
        `https://api.telegram.org/bot${b.bot}:synthetic-shop-bot-fixture/sendMessage`,
      );
      expect(JSON.parse(String(send.mock.calls.at(-1)?.[1]?.body)).text).toMatch(/истекла/);

      expect((await webhook(a, exchange, telegram)).status).toBe(200);
      const session = await finish();
      expect(session.status).toBe(200);
      if (telegram === 94500) {
        const seller = session.headers.getSetCookie().find((cookie) => cookie.startsWith("korzina_seller="));
        const headers = { Cookie: seller?.split(";")[0] ?? "" };
        expect((await getAuth(`${sellerPath}?store=${a.slug}`, headers)).status).toBe(200);
        expect((await getAuth(`${sellerPath}?store=${b.slug}`, headers)).status).toBe(403);
      }
      expect((await finish()).status).toBe(401);
    }
  } finally {
    send.mockRestore();
  }
});

it("BOT1.4 · список Telegram ID открывает админку из обоих магазинов, совпадение ника даёт 403", async () => {
  const send = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ ok: true, result: true }));
  try {
    const profileApp = new Hono().onError(handleError).route("/", profileRoutes);
    for (const shop of shops) {
      for (const telegram of [94600, 94601]) {
        const start = await post(`/api/auth/telegram/start?shop=${shop.slug}`, {});
        const { exchange } = await start.json<{ exchange: string }>();
        expect((await webhook(shop, exchange, telegram)).status).toBe(200);
        const session = await post(
          `/api/auth/telegram/finish?shop=${shop.slug}`,
          { exchange },
          {
            Cookie: cookieFrom(start),
          },
        );
        expect(session.status).toBe(200);
        const stub = exports.Shop.get(exports.Shop.idFromName(shop.id));
        await runInDurableObject(stub, async (_instance, { storage }) => {
          const profileEnv = {
            ...bindings,
            secrets: bindings,
            platform: env.PLATFORM,
            db: drizzle(storage),
            storage,
            shop,
          };
          const headers = { Cookie: cookieFrom(session) };
          const profile = await profileApp.fetch(new Request(`${origin}/`, { headers }), profileEnv);
          expect(await profile.json()).toMatchObject({ platformAdmin: telegram === 94600 });
          const admin = await profileApp.fetch(
            new Request(`${origin}/admin`, {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
              body: "{}",
            }),
            profileEnv,
          );
          expect(admin.status).toBe(telegram === 94600 ? 200 : 403);
        });
      }
    }
  } finally {
    send.mockRestore();
  }
});
