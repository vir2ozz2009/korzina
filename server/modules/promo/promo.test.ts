import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, expect, it } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import type { OrderResult } from "../../../src/shared/contracts/checkout";
import type { PromoOffer, PromoTerms } from "../../../src/shared/contracts/promo";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";
import { buy, customer, getQuote, setupCheckout } from "../checkout/testing";

const shop = "korzina-demo-lavka";
const terms: PromoTerms = {
  name: "Тестовая скидка",
  kind: "code",
  code: "HOT",
  discount: { type: "fixed", value: 7500 },
  scope: { type: "all" },
  confirmed: false,
  totalLimit: 1,
};
beforeAll(setupPlatform);
beforeEach(async () => {
  await setupCheckout();
  await catalogSql("DELETE FROM promo_uses");
  await catalogSql("DELETE FROM promo_offers");
  await catalogSql("UPDATE variants SET stock=25,price_minor=49000,old_price_minor=NULL WHERE id='sku-01'");
  await env.PLATFORM.prepare("INSERT OR REPLACE INTO feature_overrides(shop_id,key,enabled) VALUES(?,'promotions',1)")
    .bind(shop)
    .run();
});
const seller = (headers: HeadersInit, body: object, suffix = "", key = crypto.randomUUID(), store = "lavka") =>
  postAuth(`/api/seller/promotions${suffix}?store=${store}`, body, { ...headers, "Idempotency-Key": key });
const readCart = async (Cookie: string) => (await getAuth("/api/cart?shop=lavka", { Cookie })).json<Cart>();
async function code(cookie: string, value = "HOT") {
  const response = await buy(
    "cart",
    { promoAction: "apply", code: value, expectedRevision: (await readCart(cookie)).revision },
    cookie,
  );
  expect(response.status).toBe(200);
  return response.json<Cart>();
}

it("§9 §7.1 проверяет роль и магазин, сохраняет черновик и включает только опубликованный код", async () => {
  const owner = (await sellerFixture(shop)).headers;
  const picker = (await sellerFixture(shop, "employee", ["products"])).headers;
  expect((await seller(picker, { action: "publish", revision: 0, terms })).status).toBe(403);
  expect(
    (await seller(owner, { action: "publish", revision: 0, terms }, "", crypto.randomUUID(), "test2")).status,
  ).toBe(403);
  const draftKey = crypto.randomUUID();
  const draft = await (await seller(owner, { action: "draft", revision: 0, terms }, "", draftKey)).json<PromoOffer>();
  expect(draft).toMatchObject({ status: "draft", revision: 1 });
  expect(await (await seller(owner, { action: "draft", revision: 0, terms }, "", draftKey)).json()).toEqual(draft);
  const cookie = await customer("sku-01");
  expect(
    (
      await buy(
        "cart",
        { promoAction: "apply", code: "HOT", expectedRevision: (await readCart(cookie)).revision },
        cookie,
      )
    ).status,
  ).toBe(400);
  const published = await seller(owner, { action: "publish", revision: 1, terms }, `/${draft.id}`);
  expect(published.status).toBe(200);
  expect((await seller(owner, { action: "publish", revision: 0, terms })).status).toBe(400);
  expect(await code(cookie)).toMatchObject({ totalMinor: 41500, promo: { reason: "applied" } });
  const quote = await getQuote(cookie);
  expect((await seller(owner, { action: "disable", revision: 2 }, `/${draft.id}`)).status).toBe(200);
  expect(await readCart(cookie)).toMatchObject({ totalMinor: 49000, promo: { reason: "disabled" } });
  const changed = await buy("checkout", { payment: "cash", quoteRevision: quote.quoteRevision }, cookie);
  expect(changed.status).toBe(409);
  expect(await changed.json()).toMatchObject({
    error: { code: "QUOTE_CHANGED", details: { beforeMinor: 41500, afterMinor: 49000 } },
  });
});

it("§9 §7.5 одно последнее применение, один повтор заказа и одно освобождение полной отменой", async () => {
  const owner = (await sellerFixture(shop)).headers;
  const published = await seller(owner, { action: "publish", revision: 0, terms });
  expect(published.status).toBe(200);
  const a = await customer("sku-01");
  const b = await customer("sku-01");
  await Promise.all([code(a), code(b)]);
  const quotes = await Promise.all([getQuote(a), getQuote(b)]);
  const place = (index: number, key: string) =>
    buy("checkout", { payment: "cash", quoteRevision: quotes[index].quoteRevision }, index ? b : a, key);
  const keys = [crypto.randomUUID(), crypto.randomUUID()];
  const results = await Promise.all(keys.map((key, index) => place(index, key)));
  expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  const winner = results[0].status === 201 ? 0 : 1;
  const order = await results[winner].json<OrderResult>();
  expect(order).toMatchObject({
    itemsMinor: 41500,
    itemsBeforeDiscountMinor: 49000,
    lines: [{ totalMinor: 41500, promoSavingsMinor: 7500 }],
  });
  expect(await (await place(winner, keys[winner])).json()).toEqual(order);
  expect(await catalogSql("SELECT COUNT(*) as n FROM promo_uses WHERE released_at IS NULL")).toEqual([{ n: 1 }]);
  const cancelled = await buy(`orders/${order.number}/cancel`, { expectedVersion: 0 }, winner ? b : a);
  expect(cancelled.status).toBe(200);
  expect(await catalogSql("SELECT COUNT(*) as n FROM promo_uses WHERE released_at IS NULL")).toEqual([{ n: 0 }]);
  expect(await readCart(winner ? a : b)).toMatchObject({ totalMinor: 41500 });
});

it("§7.4 сравнивает замену, отмена и неизвестный код сохраняют прежний выбор", async () => {
  const owner = (await sellerFixture(shop)).headers;
  expect((await seller(owner, { action: "publish", revision: 0, terms })).status).toBe(200);
  const second = { ...terms, code: "NEW", discount: { type: "fixed", value: 9000 } };
  expect((await seller(owner, { action: "publish", revision: 0, terms: second })).status).toBe(200);
  const cookie = await customer("sku-01");
  const prior = await code(cookie);
  const compare = { promoAction: "compare", code: "NEW", expectedRevision: prior.revision };
  const comparison = await buy("cart", compare, cookie);
  expect(await comparison.json()).toMatchObject({
    totalMinor: 41500,
    promo: { code: "HOT", alternative: { code: "NEW", totalMinor: 40000 } },
  });
  expect(await readCart(cookie)).toMatchObject({ promo: { code: "HOT" } });
  expect(
    (await buy("cart", { ...compare, promoAction: "apply", code: "UNKNOWN", comparedTotal: 49000 }, cookie)).status,
  ).toBe(400);
  expect(await readCart(cookie)).toMatchObject({ promo: { code: "HOT" } });
  expect(
    await (await buy("cart", { ...compare, promoAction: "apply", comparedTotal: 40000 }, cookie)).json(),
  ).toMatchObject({ totalMinor: 40000, promo: { code: "NEW" } });
});

it("§7.8 оформляет нулевой итог без метода перевода и чека, минимум до скидки остаётся в силе", async () => {
  const owner = (await sellerFixture(shop)).headers;
  const full = { ...terms, discount: { type: "percent", value: 10000 } };
  expect((await seller(owner, { action: "publish", revision: 0, terms: full })).status).toBe(200);
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='purchase_payment'",
    JSON.stringify({ minimumMinor: 49000, methods: ["transfer"], instruction: "Счёт магазина" }),
  );
  const cookie = await customer("sku-01");
  await code(cookie);
  const quote = await getQuote(cookie);
  expect(quote).toMatchObject({
    totalMinor: 0,
    itemsBeforeDiscountMinor: 49000,
    paymentSettings: { methods: ["cash"] },
  });
  expect((await buy("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" }, cookie)).status).toBe(201);
});

it("§11 §14 агрегирует выполненные заказы, не удваивает события, сохраняет историю при повторе", async () => {
  const { headers } = await sellerFixture(shop);
  const response = await seller(headers, { action: "publish", revision: 0, terms });
  const original = await response.json<PromoOffer>();
  const cookie = await customer("sku-01");
  await code(cookie);
  const quote = await getQuote(cookie);
  const placed = await buy("checkout", { payment: "cash", quoteRevision: quote.quoteRevision }, cookie);
  const order = await placed.json<OrderResult>();
  const report = () => getAuth(`/api/seller/promotions/${original.id}/report?store=lavka`, headers);
  expect(await (await report()).json()).toMatchObject({ orderCount: 0, savingsMinor: 0 });
  await catalogSql("UPDATE orders SET status='completed' WHERE number=?", order.number);
  for (let round = 0; round < 2; round++) {
    await catalogSql(
      "INSERT INTO buyer_order_events(order_number,actor,event,created_at) VALUES(?,'test','order.complete',?)",
      order.number,
      Date.now(),
    );
  }
  expect(await (await report()).json()).toMatchObject({
    orderCount: 1,
    itemsMinor: 41500,
    savingsMinor: 7500,
    guestOrders: 1,
  });
  await catalogSql(
    "UPDATE orders SET fulfillment_state=? WHERE number=?",
    JSON.stringify({ finance: { salesRefund: { variants: { "sku-01": 8300 } } } }),
    order.number,
  );
  expect(await (await report()).json()).toMatchObject({
    orderCount: 1,
    itemsMinor: 33200,
    savingsMinor: 6000,
    guestOrders: 1,
  });
  await catalogSql("UPDATE promo_offers SET ends_at=? WHERE id=?", Date.now() - 1000, original.id);
  const key = crypto.randomUUID();
  const repeat = () => seller(headers, { action: "repeat", revision: 1 }, `/${original.id}`, key);
  const copy = await (await repeat()).json<PromoOffer>();
  expect(copy).toMatchObject({ status: "draft", orders: 0, used: 0 });
  expect(copy.id).not.toBe(original.id);
  expect(await (await repeat()).json()).toEqual(copy);
  expect(await (await report()).json()).toMatchObject({ orderCount: 1, savingsMinor: 6000 });
});

it("§13.21 §14.5 цена фасовки до, во время и после периода совпадает с витриной и корзиной", async () => {
  const { headers } = await sellerFixture(shop);
  const path = "/api/seller/promotions?store=lavka";
  const now = Date.now();
  await catalogSql(
    "UPDATE variants SET price_minor=80,old_price_minor=100,promo_starts_at=?,promo_ends_at=? WHERE id='sku-01'",
    now + 60000,
    now + 120000,
  );
  const live = () => getAuth("/api/catalog/live?shop=lavka&ids=sku-01");
  expect(await (await live()).json()).toMatchObject({ items: [{ priceMinor: 100, oldPriceMinor: null }] });
  expect(await (await getAuth(`${path}&status=scheduled&kind=price`, headers)).json()).toMatchObject({
    prices: [{ variantId: "sku-01", status: "scheduled", priceMinor: 80, oldPriceMinor: 100 }],
  });
  await catalogSql("UPDATE variants SET promo_starts_at=? WHERE id='sku-01'", now - 1000);
  expect(await (await live()).json()).toMatchObject({ items: [{ priceMinor: 80, oldPriceMinor: 100 }] });
  const cookie = await customer("sku-01");
  expect(await readCart(cookie)).toMatchObject({ lines: [{ priceMinor: 80, oldPriceMinor: 100 }] });
  await catalogSql("UPDATE variants SET promo_ends_at=? WHERE id='sku-01'", now - 100);
  expect(await (await live()).json()).toMatchObject({ items: [{ priceMinor: 100, oldPriceMinor: null }] });
  expect(await readCart(cookie)).toMatchObject({
    lines: [{ priceMinor: 100 }],
    review: { changes: [{ oldPriceMinor: 80 }] },
  });
});
