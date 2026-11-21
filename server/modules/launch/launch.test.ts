import { env } from "cloudflare:workers";
import { assert, beforeAll, expect, it } from "vitest";
import type { OrderResult, QuoteResponse } from "../../../src/shared/contracts/checkout";
import type { LaunchReadiness } from "../../../src/shared/contracts/launch";
import { invalidateShopAddress } from "../../platform/resolve-shop";
import { cookieFrom, getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
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
