import { runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import type { OrderResult, QuoteResponse } from "../../../src/shared/contracts/checkout";
import { assertSqlBudget, type SqlMetrics } from "../../metrics";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, catalogStub } from "../catalog/testing";

beforeAll(setupPlatform);
beforeEach(async () => {
  await catalogSql("UPDATE catalog_state SET currency='VND' WHERE id=1");
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='fulfillment'",
    JSON.stringify({
      delivery: {
        mode: "map",
        zones: [
          {
            id: "center",
            geometry: { type: "radius", center: { lat: 10.7769, lon: 106.7009 }, radiusMeters: 6000 },
            tariff: { kind: "fixed", feeMinor: 25000 },
          },
        ],
      },
      pickup: { address: "45 Lê Lợi", hours: "09:00–20:00" },
    }),
  );
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='receiving_schedule'",
    JSON.stringify({
      timeZone: "Asia/Ho_Chi_Minh",
      delivery: { mode: "after_order", days: {} },
      pickup: { mode: "after_order", days: {} },
    }),
  );
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='purchase_payment'",
    JSON.stringify({
      minimumMinor: 0,
      methods: ["cash", "transfer"],
      instruction: "Инструкция тестового магазина",
    }),
  );
});

const buy = (path: string, body: object, Cookie: string, key: string = crypto.randomUUID()) =>
  postAuth(`/api/${path}?shop=lavka`, body, { Cookie, "Idempotency-Key": key });
const getQuote = async (cookie: string) => {
  const response = await buy("quote", {}, cookie);
  expect(response.status).toBe(200);
  return response.json<QuoteResponse>();
};
async function customer(variantId: string, receiving = { mode: "pickup" } as object) {
  const contact = await postAuth("/api/auth/contact?shop=lavka", { phone: "+84912345678", confirmed: true });
  const cookie = cookieFrom(contact);
  expect(contact.status).toBe(200);
  const cart = await buy("cart", { variantId, quantity: 1, expectedRevision: 0 }, cookie);
  expect(cart.status).toBe(200);
  expect((await buy("receiving", { receiving, expectedRevision: 1, complete: true }, cookie)).status).toBe(200);
  return cookie;
}

it("наличные: один заказ при повторе, последний товар достаётся одному, данные сохраняются снимком", async () => {
  await catalogSql("UPDATE variants SET stock=1,price_minor=130000 WHERE id='sku-01'");
  const address = { mode: "delivery", address: "28 Lê Lợi", apartment: "8", point: { lat: 10.7769, lon: 106.7009 } };
  const a = await customer("sku-01", address);
  const b = await customer("sku-01");
  const keys = [await getQuote(a), await getQuote(b)];
  expect(keys[0]).toMatchObject({ currency: "VND", itemsMinor: 130000, deliveryMinor: 25000, totalMinor: 155000 });
  const submit = (quoteRevision: string, cookie: string, key?: string) =>
    buy("checkout", { quoteRevision, payment: "cash" }, cookie, key);
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const results = await Promise.all([
    submit(keys[0].quoteRevision, a, ids[0]),
    submit(keys[1].quoteRevision, b, ids[1]),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  const winner = results[0].status === 201 ? 0 : 1;
  const order = await results[winner].json<OrderResult>();
  const owner = winner === 0 ? a : b;
  const stranger = winner === 0 ? b : a;
  expect(order.paymentStatus).toBe("unpaid");
  expect(order.lines[0]?.totalMinor).toBe(130000);
  expect(await (await submit(keys[winner].quoteRevision, owner, ids[winner])).json()).toEqual(order);
  await catalogSql("UPDATE variants SET price_minor=250000 WHERE id='sku-01'");
  expect(await (await getAuth(`/api/checkout/orders/${order.number}?shop=lavka`, { Cookie: owner })).json()).toEqual(
    order,
  );
  expect((await getAuth(`/api/checkout/orders/${order.number}?shop=lavka`, { Cookie: stranger })).status).toBe(404);
  expect(await (await getAuth("/api/cart?shop=lavka", { Cookie: owner })).json()).toMatchObject({ count: 0 });
  expect(await catalogSql("SELECT event FROM order_outbox WHERE order_number=?", order.number)).toEqual([
    { event: "order.placed" },
  ]);
});

it("минимум проверяет товары, сумма в RUB складывается из товаров и тарифа", async () => {
  await catalogSql("UPDATE catalog_state SET currency='RUB' WHERE id=1");
  await catalogSql("UPDATE variants SET stock=10,price_minor=18900 WHERE id='sku-01'");
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='fulfillment'",
    JSON.stringify({
      delivery: { mode: "text", tariff: { kind: "fixed", feeMinor: 5000 } },
      requiredDetails: [],
    }),
  );
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='purchase_payment'",
    JSON.stringify({
      minimumMinor: 20000,
      methods: ["cash"],
    }),
  );
  const cookie = await customer("sku-01", { mode: "delivery", address: "Озёрная, 7" });
  const tooLow = await buy("quote", {}, cookie);
  expect(tooLow.status).toBe(409);
  expect(await tooLow.json()).toMatchObject({ error: { code: "MIN_ORDER_SUM", details: { itemsMinor: 18900 } } });
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='purchase_payment'",
    JSON.stringify({
      minimumMinor: 18000,
      methods: ["cash"],
    }),
  );
  expect(await getQuote(cookie)).toMatchObject({
    currency: "RUB",
    itemsMinor: 18900,
    deliveryMinor: 5000,
    totalMinor: 23900,
  });
});

it("чек связывается один раз с исходной суммой, новый расчёт даёт доплату и не подтверждает деньги", async () => {
  await catalogSql("UPDATE variants SET stock=10,price_minor=130000 WHERE id='sku-02'");
  const cookie = await customer("sku-02");
  const { subject } = await (await getAuth("/api/auth/session?shop=lavka", { Cookie: cookie })).json<{
    subject: string;
  }>();
  const old = await getQuote(cookie);
  const id = crypto.randomUUID();
  await catalogSql(
    `INSERT INTO media(id,owner,purpose,status,ready,bytes,mime,request_key,fingerprint,created_at,expires_at)
     VALUES(?,?,'receipt','temp',1,30,'application/pdf','checkout-test','file',?,?)`,
    id,
    subject,
    Date.now(),
    Date.now() + 3600000,
  );
  expect((await buy("checkout/receipt", { proofMediaId: id, quoteRevision: old.quoteRevision }, cookie)).status).toBe(
    200,
  );
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='purchase_payment'",
    JSON.stringify({
      minimumMinor: 0,
      methods: ["cash", "transfer"],
      instruction: "Новые реквизиты тестового магазина",
    }),
  );
  await catalogSql("UPDATE variants SET price_minor=135000 WHERE id='sku-02'");
  expect(
    (await buy("checkout", { payment: "transfer", quoteRevision: old.quoteRevision, proofMediaId: id }, cookie)).status,
  ).toBe(409);
  const reviewed = await (await getAuth("/api/cart?shop=lavka", { Cookie: cookie })).json<{ revision: number }>();
  expect((await buy("cart", { confirm: true, expectedRevision: reviewed.revision }, cookie)).status).toBe(200);
  const next = await getQuote(cookie);
  const command = { payment: "transfer", quoteRevision: next.quoteRevision, proofMediaId: id };
  const response = await catalogStub().fetch(
    new Request("https://demo.korzina.app/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        "x-korzina-shop": encodeURIComponent(
          JSON.stringify({
            id: "korzina-demo-lavka",
            slug: "lavka",
            name: "Test",
            status: "active",
            plan: "base",
            createdAt: 0,
          }),
        ),
        Cookie: cookie,
      },
      body: JSON.stringify(command),
    }),
  );
  expect(response.status).toBe(201);
  const metrics: SqlMetrics = JSON.parse(response.headers.get("x-korzina-sql") ?? "null");
  assertSqlBudget(metrics, { sql: 15, rowsRead: 32, rowsWritten: 17 });
  expect(await response.json()).toMatchObject({
    paymentStatus: "pending_review",
    totalMinor: 135000,
    transferReview: { priorTotalMinor: 130000, differenceMinor: 5000, credentialsChanged: true },
  });
  expect(await catalogSql("SELECT status,expires_at FROM media WHERE id=?", id)).toEqual([
    { status: "attached", expires_at: null },
  ]);
  await runInDurableObject(catalogStub(), (_shop, { storage }) => {
    expect(storage.sql.exec("SELECT number FROM orders WHERE proof_media_id=?", id).toArray()).toHaveLength(1);
  });
});

it("служебные поля сохранённого расчёта не требуют повторного подтверждения", async () => {
  const cookie = await customer("sku-01");
  const { quoteRevision } = await getQuote(cookie);
  await catalogSql(
    "UPDATE checkout_quotes SET snapshot=json_set(snapshot,'$.trace',1,'$.lines[0].trace',1) WHERE id=?",
    quoteRevision,
  );
  expect((await buy("checkout", { quoteRevision, payment: "cash" }, cookie)).status).toBe(201);
});

it("прежний расчёт отклоняется после изменения и подтверждения цены в корзине", async () => {
  await catalogSql("UPDATE variants SET price_minor=130000 WHERE id='sku-01'");
  const cookie = await customer("sku-01");
  const { quoteRevision } = await getQuote(cookie);
  await catalogSql("UPDATE variants SET price_minor=135000 WHERE id='sku-01'");
  const reviewed = await (await getAuth("/api/cart?shop=lavka", { Cookie: cookie })).json<{ revision: number }>();
  expect((await buy("cart", { confirm: true, expectedRevision: reviewed.revision }, cookie)).status).toBe(200);
  const response = await buy("checkout", { quoteRevision, payment: "cash" }, cookie);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: { code: "QUOTE_CHANGED", details: { beforeMinor: 130000, afterMinor: 135000 } },
  });
});

it("отмена покупателя освобождает остаток один раз, закрывает активный заказ и сохраняет историю", async () => {
  await catalogSql("UPDATE variants SET stock=2 WHERE id='sku-01'");
  const owner = await customer("sku-01");
  const stranger = await customer("sku-02");
  const quote = await getQuote(owner);
  const placed = await buy("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" }, owner);
  expect(placed.status).toBe(201);
  const { number } = await placed.json<OrderResult>();
  const get = (path: string, cookie = owner) =>
    getAuth(`/api/orders${path}${path.includes("?") ? "&" : "?"}shop=lavka`, { Cookie: cookie });
  expect((await get(`/${number}`, stranger)).status).toBe(404);
  const active = await get("/active");
  expect(await active.json()).toMatchObject({ data: { count: 1, orders: [{ number, stage: "placed" }] } });
  const badge = active.headers.get("etag");
  const unchanged = await getAuth("/api/orders/active?shop=lavka", { Cookie: owner, "If-None-Match": badge ?? "" });
  expect(unchanged.status).toBe(304);
  const key = crypto.randomUUID();
  const cancel = () => buy(`orders/${number}/cancel`, { expectedVersion: 0 }, owner, key);
  const cancelled = await cancel();
  expect(await cancelled.json()).toMatchObject({ number, stage: "cancelled", version: 1, canCancel: false });
  expect((await cancel()).status).toBe(200);
  expect(await catalogSql("SELECT stock FROM variants WHERE id='sku-01'")).toEqual([{ stock: 2 }]);
  expect(await (await get("/active")).json()).toMatchObject({ data: { count: 0 } });
  expect(await (await get("?tab=completed")).json()).toMatchObject({ orders: [{ number, stage: "cancelled" }] });
});

it("повтор блокирует изменившуюся цену и добавляет доступное количество поверх корзины один раз", async () => {
  await catalogSql("UPDATE variants SET stock=5,price_minor=100000 WHERE id='sku-01'");
  const owner = await customer("sku-01");
  const quote = await getQuote(owner);
  const { number } = await (
    await buy("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" }, owner)
  ).json<OrderResult>();
  const path = `orders/${number}/repeat`;
  const preview = async () =>
    (await getAuth(`/api/${path}?shop=lavka`, { Cookie: owner })).json<{
      check: string;
      expectedCartRevision: number;
      lines: { priceMinor: number }[];
    }>();
  const command = (data: Awaited<ReturnType<typeof preview>>, key?: string) =>
    buy(path, { expectedCartRevision: data.expectedCartRevision, check: data.check }, owner, key);
  const before = await preview();
  await catalogSql("UPDATE variants SET price_minor=130000 WHERE id='sku-01'");
  expect((await command(before)).status).toBe(409);
  const after = await preview();
  expect(after.lines[0]?.priceMinor).toBe(130000);
  const key = crypto.randomUUID();
  expect(await (await command(after, key)).json()).toMatchObject({ cart: { count: 1 } });
  expect(await (await command(after, key)).json()).toMatchObject({ cart: { count: 1 } });
});
