import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { tokenHash } from "../../auth/tokens";
import { app } from "../../index";
import { catalogSql } from "../../modules/catalog/testing";
import { cookieFrom, getAuth, postAuth, signedInitData } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { botFixtureKey, setShopBot } from "../../testing/shop-bot";
import { storefrontUrl } from "../storefront-url";
import { confirmSellerExchange, startSellerExchange } from "./browser-exchange";
import { telegramSellerSession } from "./sessions";

beforeAll(setupPlatform);

async function membership(telegramId: string, shopId: string, role = "owner") {
  await env.PLATFORM.batch([
    env.PLATFORM.prepare("INSERT INTO accounts(id,telegram_id) VALUES(?,?) ON CONFLICT(telegram_id) DO NOTHING").bind(
      crypto.randomUUID(),
      telegramId,
    ),
    env.PLATFORM.prepare(
      "INSERT INTO memberships(shop_id,account_id,role) SELECT ?,id,? FROM accounts WHERE telegram_id=?",
    ).bind(shopId, role, telegramId),
  ]);
}

const shop = "korzina-demo-lavka";
async function buyer(telegramId?: string) {
  const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
  await catalogSql(
    "INSERT INTO sessions(token_hash,subject,kind,expires_at) VALUES(?,?,?,?)",
    await tokenHash(token),
    telegramId ? `telegram:${telegramId}` : "guest:device",
    telegramId ? "telegram" : "guest",
    Date.now() + 60_000,
  );
  return { Cookie: `korzina_customer_${shop}=${token}` };
}

it("§9.9 · §9.12 подтверждённый Telegram и членство текущего магазина управляют входом из профиля", async () => {
  await membership("90001", shop);
  await membership("90002", "korzina-demo-test2");
  const owner = await buyer("90001");
  const otherShop = await buyer("90002");
  const guest = await buyer();
  const profile = (headers: HeadersInit) => getAuth("/api/profile?shop=lavka", headers);
  expect(await (await profile(owner)).json()).toMatchObject({ sellerCabinet: true });
  const phone = await postAuth("/api/auth/contact?shop=lavka", { phone: "+84912345678", confirmed: true });
  const device = { Cookie: cookieFrom(phone) };
  for (const header of [otherShop, device]) {
    expect(await (await profile(header)).json()).toMatchObject({ sellerCabinet: false });
  }
  expect((await profile(guest)).status).toBe(401);
  expect((await postAuth("/api/profile/seller?shop=lavka", {}, otherShop)).status).toBe(403);
  expect((await postAuth("/api/profile/seller?shop=lavka", {}, device)).status).toBe(401);
  const entered = await postAuth("/api/profile/seller?shop=lavka", {}, owner);
  expect(entered.status).toBe(200);
  const headers = { Cookie: cookieFrom(entered) };
  const cabinet = (store: string) => getAuth(`/api/seller/cabinet?store=${store}`, headers);
  expect(await (await cabinet("lavka")).json()).toMatchObject({
    telegramId: "90001",
    current: { slug: "lavka", role: "owner", storefrontUrl: "https://demo.korzina.app/?shop=lavka" },
    shops: [{ id: shop, storefrontUrl: "https://demo.korzina.app/?shop=lavka" }],
  });
  expect((await cabinet("test2")).status).toBe(403);
  await env.PLATFORM.prepare(
    "UPDATE memberships SET revoked_at=? WHERE shop_id=? AND account_id=(SELECT id FROM accounts WHERE telegram_id=?)",
  )
    .bind(Date.now(), shop, "90001")
    .run();
  expect((await cabinet("lavka")).status).toBe(403);
  expect(await (await profile(owner)).json()).toMatchObject({ sellerCabinet: false });
});

it("§13.3: адрес витрины использует origin стенда или поддомен магазина на prod", () => {
  expect(storefrontUrl("https://demo.korzina.app/seller?store=test2", "demo", "test2")).toBe(
    "https://demo.korzina.app/?shop=test2",
  );
  expect(storefrontUrl("https://preview.example.com/admin/shops/test2", "preview", "test2")).toBe(
    "https://preview.example.com/?shop=test2",
  );
  expect(storefrontUrl("https://admin.korzina.app/admin/shops/test2", "production", "test2")).toBe(
    "https://test2.korzina.app/",
  );
});

it("§9.1 · §9.12 запасной Telegram-вход привязан к исходному браузеру и используется один раз", async () => {
  await membership("90003", shop);
  const bot = { id: "93003", username: "KorzinaFixtureBot" };
  const returnUrl = "https://demo.korzina.app/seller?store=lavka#telegram-return";
  const { exchange, cookie } = await startSellerExchange(env.PLATFORM, shop, bot, returnUrl);
  const finish = (Cookie: string) => postAuth("/api/seller/cabinet/finish", { exchange }, { Cookie });
  const browser = `${cookie.name}=${cookie.value}`;
  expect((await finish(browser)).status).toBe(202);
  const update = { message: { from: { id: 90003 }, chat: { id: 90003, type: "private" }, text: `/start ${exchange}` } };
  expect((await postAuth(`/api/platform/shop-telegram/${shop}`, update)).status).toBe(403);
  expect((await finish(browser)).status).toBe(202);
  expect(await confirmSellerExchange(env.PLATFORM, exchange, "90003", shop, bot.id)).toEqual({ return_url: returnUrl });
  expect(await confirmSellerExchange(env.PLATFORM, exchange, "90004", shop, bot.id)).toBeUndefined();
  expect((await finish("")).status).toBe(401);
  const results = await Promise.all([finish(browser), finish(browser)]);
  expect(results.map((response) => response.status).sort()).toEqual([200, 401]);
  const success = results.find((response) => response.ok);
  const session = success?.headers.getSetCookie().find((cookie) => cookie.startsWith("korzina_seller="));
  expect(session).toBeDefined();
  expect(await (await getAuth("/api/seller/cabinet", { Cookie: session?.split(";")[0] ?? "" })).json()).toMatchObject({
    current: { id: shop },
    shops: [{ id: shop }],
    telegramId: "90003",
  });
});

it("§9.4 · профиль продавца читает Telegram из сессии и выход отзывает эту сессию", async () => {
  const token = await telegramSellerSession(env.PLATFORM, "90005", shop);
  const header = { Cookie: `korzina_seller=${token}` };
  const read = () => getAuth("/api/seller/cabinet", header);
  expect(await (await read()).json()).toMatchObject({ telegramId: "90005" });
  expect((await postAuth("/api/platform/auth/logout", {}, header)).status).toBe(200);
  expect((await read()).status).toBe(401);
});

it("BOT1.3 · Mini App проверяет подпись Telegram и доступ к указанному магазину", async () => {
  const first = await setShopBot(env.PLATFORM, shop, "93005");
  const second = await setShopBot(env.PLATFORM, "korzina-demo-test2", "93006");
  await membership("90006", shop);
  await membership("90006", "korzina-demo-test2", "employee");
  const login = async (signedBy: string, store: string, bearer = false) => {
    const initData = await signedInitData(signedBy, { user: JSON.stringify({ id: 90006 }) });
    return app.fetch(
      new Request("https://demo.korzina.app/api/seller/cabinet/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ initData, store, bearer }),
      }),
      { ...env, ENCRYPTION_KEY: botFixtureKey },
    );
  };
  expect((await login("90006:other-fixture", "test2")).status).toBe(401);
  expect((await login(second.token, "lavka")).status).toBe(401);
  expect((await login(first.token, "lavka")).status).toBe(200);
  const found = await login(second.token, "test2");
  expect(found.status).toBe(200);
  expect(await (await getAuth("/api/seller/cabinet?store=test2", { Cookie: cookieFrom(found) })).json()).toMatchObject({
    current: { slug: "test2", role: "employee" },
  });

  const embedded = await login(second.token, "test2", true);
  expect(embedded.status).toBe(200);
  expect(embedded.headers.has("Set-Cookie")).toBe(false);
  const { token } = await embedded.json<{ token: string }>();
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  const authorization = { Authorization: `Bearer ${token}` };
  const read = () => getAuth("/api/seller/cabinet?store=test2", authorization);
  expect(await (await read()).json()).toMatchObject({ current: { slug: "test2", role: "employee" } });
  expect((await getAuth("/api/seller/cabinet?store=lavka", authorization)).status).toBe(403);
  expect((await getAuth("/api/seller/access/orders?shop=lavka", authorization)).status).toBe(403);
  expect((await postAuth("/api/platform/auth/logout", {}, authorization)).status).toBe(200);
  expect((await read()).status).toBe(401);
});
