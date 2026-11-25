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
