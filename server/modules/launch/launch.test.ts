import { env } from "cloudflare:workers";
import { assert, beforeAll, expect, it } from "vitest";
import type { OrderResult, QuoteResponse } from "../../../src/shared/contracts/checkout";
import type { LaunchReadiness } from "../../../src/shared/contracts/launch";
import { app } from "../../index";
import { openAdminSession } from "../../platform/admin/access";
import { invalidateShopAddress } from "../../platform/resolve-shop";
import { cookieFrom, getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { customerTtl } from "../auth/service";
import { catalogSql } from "../catalog/testing";
import { setupCheckout } from "../checkout/testing";

const shop = "korzina-demo-lavka";
const launch = "/api/seller/launch?store=lavka";
const api = (path: string) => `/api/${path}?shop=lavka`;

async function closeShop() {
  await env.PLATFORM.prepare("UPDATE shops SET status='draft',currency='VND',version=version+1 WHERE id=?")
    .bind(shop)
    .run();
  await invalidateShopAddress(env.APP_ENV, "lavka");
}

beforeAll(async () => {
  await setupPlatform();
  await setupCheckout();
});

it("§12.5–§12.6 сотрудник видит обычный каталог и оформляет заказ, посторонний и бывший сотрудник получают отказ", async () => {
  const publicCatalog = await getAuth(api("catalog/document"));
  assert(publicCatalog.ok);
  const catalog = await publicCatalog.json();
  await closeShop();
  const member = await sellerFixture(shop, "employee", ["orders"]);
  const other = await sellerFixture("korzina-demo-test2");
  const preview = { "x-korzina-preview-session": member.headers.Authorization.slice(7) };
  expect((await getAuth(api("catalog/document"))).status).toBe(404);
  expect(
    (await getAuth(api("shop"), { "x-korzina-preview-session": other.headers.Authorization.slice(7) })).status,
  ).toBe(404);
  expect(await (await getAuth(api("catalog/document"), preview)).json()).toEqual(catalog);
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='purchase_payment'",
    JSON.stringify({
      minimumMinor: 0,
      methods: ["cash", "transfer"],
      qrSrc: "/demo/payment-qr.png",
    }),
  );
  const contact = await postAuth(api("auth/contact"), { phone: "+84912345678", confirmed: true }, preview);
  expect(contact.status).toBe(200);
  const buyer = { ...preview, Cookie: cookieFrom(contact) };
  const cart = await postAuth(api("cart"), { variantId: "sku-01", quantity: 1, expectedRevision: 0 }, buyer);
  expect(cart.status).toBe(200);
  const receiving = { mode: "delivery", address: "28 Lê Lợi", apartment: "8", point: { lat: 10.7769, lon: 106.7009 } };
  expect((await postAuth(api("receiving"), { receiving, expectedRevision: 1, complete: true }, buyer)).status).toBe(
    200,
  );
  const quote = await postAuth(api("quote"), {}, buyer);
  expect(quote.status).toBe(200);
  const { quoteRevision, deliveryMinor, paymentSettings } = await quote.json<QuoteResponse>();
  expect(deliveryMinor).toBe(25000);
  expect(paymentSettings.qrSrc).toBe("/demo/payment-qr.png");
  const session = await getAuth(api("auth/session"), buyer);
  const { subject } = await session.json<{ subject: string }>();
  const proofMediaId = crypto.randomUUID();
  await catalogSql(
    `INSERT INTO media(id,owner,purpose,status,ready,bytes,mime,request_key,fingerprint,created_at,expires_at)
     VALUES(?,?,'receipt','temp',1,30,'application/pdf','preview-test','file',?,?)`,
    proofMediaId,
    subject,
    Date.now(),
    Date.now() + 3600000,
  );
  expect((await postAuth(api("checkout/receipt"), { quoteRevision, proofMediaId }, buyer)).status).toBe(200);
  const payload = { quoteRevision, payment: "transfer", proofMediaId };
  expect((await postAuth(api("checkout"), payload, { Cookie: buyer.Cookie })).status).toBe(404);
  const commit = { ...buyer, "Idempotency-Key": crypto.randomUUID() };
  const response = await postAuth(api("checkout"), payload, commit);
  expect(response.status).toBe(201);
  const order = await response.json<OrderResult>();
  expect(order.paymentStatus).toBe("pending_review");
  expect(await catalogSql("SELECT event FROM order_outbox WHERE order_number=?", order.number)).toEqual([
    { event: "order.placed" },
  ]);
  const sellerOrder = await getAuth(`/api/seller/orders/${order.number}?store=lavka`, member.headers);
  expect(sellerOrder.status).toBe(200);
  expect(await catalogSql("SELECT status FROM media WHERE id=?", proofMediaId)).toEqual([{ status: "attached" }]);
  const cancelled = await postAuth(api(`orders/${order.number}/cancel`), { expectedVersion: 0 }, buyer);
  expect(await cancelled.json()).toMatchObject({ number: order.number, stage: "cancelled" });
  await env.PLATFORM.prepare("UPDATE memberships SET revoked_at=? WHERE shop_id=? AND account_id=?")
    .bind(Date.now(), shop, member.accountId)
    .run();
  expect((await postAuth(api("checkout"), payload, commit)).status).toBe(404);
});

it("§11.6–§11.7 владелец открывает магазин только после проверки настроек и актуальной ревизии", async () => {
  await closeShop();
  const owner = await sellerFixture(shop);
  const path = "/api/seller/launch/open?store=lavka";
  const settings = { minimumMinor: 0, methods: ["cash"] };
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='purchase_payment'",
    JSON.stringify({ ...settings, methods: [] }),
  );
  const readiness = async () => {
    const response = await getAuth(launch, owner.headers);
    assert(response.ok);
    return response.json<LaunchReadiness>();
  };
  const old = await readiness();
  expect(old.items.find(({ key }) => key === "payment")?.ready).toBe(false);
  const denied = await postAuth(path, { revision: old.revision }, owner.headers);
  expect(await denied.json()).toMatchObject({ error: { code: "NOT_READY" } });
  await catalogSql("UPDATE settings SET value=? WHERE key='purchase_payment'", JSON.stringify(settings));
  expect((await postAuth(path, { revision: old.revision }, owner.headers)).status).toBe(409);
  const current = await readiness();
  expect(current.items.every(({ ready }) => ready)).toBe(true);
  const headers = { ...owner.headers, "Idempotency-Key": crypto.randomUUID() };
  const opened = await postAuth(path, { revision: current.revision }, headers);
  expect(opened.status).toBe(200);
  expect(await opened.json()).toMatchObject({ status: "active" });
  expect((await postAuth(path, { revision: current.revision }, headers)).status).toBe(200);
  expect((await getAuth(api("catalog/document"))).status).toBe(200);
});

it("§9.5, §11.7 только администратор подтверждает открытие неполного черновика и снимает административную паузу", async () => {
  await closeShop();
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='purchase_payment'",
    JSON.stringify({ minimumMinor: 0, methods: [] }),
  );
  const manager = await sellerFixture(shop, "employee", ["publish", "shop_settings"]);
  const picker = await sellerFixture(shop, "employee", ["orders"]);
  await env.PLATFORM.prepare("UPDATE memberships SET team_role='manager' WHERE account_id=?")
    .bind(manager.accountId)
    .run();
  await env.PLATFORM.prepare("UPDATE memberships SET team_role='picker' WHERE account_id=?")
    .bind(picker.accountId)
    .run();
  expect((await getAuth(launch, picker.headers)).status).toBe(403);
  const { revision } = await (await getAuth(launch, manager.headers)).json<LaunchReadiness>();
  const openPath = "/api/seller/launch/open?store=lavka";
  expect(await (await postAuth(openPath, { revision }, manager.headers)).json()).toMatchObject({
    error: { code: "NOT_READY" },
  });
  expect((await postAuth(openPath, { revision, force: true }, manager.headers)).status).toBe(400);

  const telegramId = "92222";
  const bindings = { ...env, PLATFORM_ADMIN_TELEGRAM_IDS: telegramId };
  await env.PLATFORM.batch([
    env.PLATFORM.prepare("INSERT INTO accounts(id,telegram_id) VALUES('launch-admin',?)").bind(telegramId),
    env.PLATFORM.prepare("INSERT INTO platform_admins(account_id) VALUES('launch-admin')"),
  ]);
  const { token } = await openAdminSession(env.PLATFORM, bindings, telegramId, Date.now() + customerTtl * 1000);
  const version = await env.PLATFORM.prepare("SELECT version FROM shops WHERE id=?")
    .bind(shop)
    .first<number>("version");
  const change = (status: "active" | "paused", version: number | null, key: string, force?: true) =>
    app.fetch(
      new Request(`https://demo.korzina.app/api/platform/admin/shops/${shop}`, {
        method: "PATCH",
        headers: { Cookie: `korzina_admin=${token}`, "Idempotency-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", status, version, ...(force && { force }) }),
      }),
      bindings,
    );
  const rejected = await change("active", version, crypto.randomUUID());
  expect(await rejected.json()).toMatchObject({ error: { code: "NOT_READY" } });
  const key = crypto.randomUUID();
  const responses = await Promise.all([change("active", version, key, true), change("active", version, key, true)]);
  expect(responses.map(({ status }) => status)).toEqual([200, 200]);
  const { version: opened } = await responses[0].json<{ version: number }>();
  await expect(responses[1].json()).resolves.toMatchObject({ version: opened });
  expect((await change("paused", opened, crypto.randomUUID())).status).toBe(200);
  expect(await (await postAuth(openPath, { revision }, manager.headers)).json()).toMatchObject({
    error: { code: "ADMIN_PAUSED" },
  });
  expect(
    await env.PLATFORM.prepare("SELECT COUNT(*) AS count FROM platform_audit WHERE actor_id='launch-admin'").first(
      "count",
    ),
  ).toBe(2);
});
