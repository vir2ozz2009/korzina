import { expect, it } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import type { OrderResult } from "../../../src/shared/contracts/checkout";
import type { PromoOffer, PromoTerms } from "../../../src/shared/contracts/promo";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { catalogSql } from "../catalog/testing";
import { buy, customer, getQuote } from "../checkout/testing";
import { readCart, seller, shop } from "./cart-followup-fixture";

const terms: PromoTerms = {
  name: "Доставка",
  kind: "code",
  code: "SHIP",
  delivery: true,
  discount: { type: "fixed", value: 0 },
  scope: { type: "all" },
  confirmed: false,
  totalLimit: 1,
};
async function tariff(fee: number | null, payee = "shop") {
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='fulfillment'",
    JSON.stringify({
      delivery: {
        mode: "text",
        payee,
        tariff: fee === null ? { kind: "after_order" } : { kind: "fixed", feeMinor: fee },
      },
      pickup: { address: "Самовывоз", hours: "09:00–20:00" },
    }),
  );
}
async function apply(cookie: string, code = "SHIP") {
  const response = await buy(
    "cart",
    { promoAction: "apply", code, expectedRevision: (await readCart(cookie)).revision },
    cookie,
  );
  expect(response.status).toBe(200);
  return response.json<Cart>();
}
const address = { mode: "delivery", address: "Учебный адрес", apartment: "1" };

it("A6 §7.6–7/13 · последнее применение, повтор, поздний тариф по снимку и освобождение нулём/отменой", async () => {
  const { headers } = await sellerFixture(shop);
  await tariff(null);
  const offer = await (await seller(headers, { action: "publish", revision: 0, terms })).json<PromoOffer>();
  const cookies = await Promise.all([customer("sku-01", address), customer("sku-01", address)]);
  await Promise.all(cookies.map((cookie) => apply(cookie)));
  expect(await catalogSql("SELECT COUNT(*) AS n FROM promo_uses")).toEqual([{ n: 0 }]);
  const quotes = await Promise.all(cookies.map(getQuote));
  const keys = cookies.map(() => crypto.randomUUID());
  const place = (i: number) =>
    buy("checkout", { payment: "cash", quoteRevision: quotes[i].quoteRevision }, cookies[i], keys[i]);
  const results = await Promise.all(cookies.map((_, i) => place(i)));
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  const win = results.findIndex((r) => r.status === 201);
  const order = await results[win].json<OrderResult>();
  expect(order).toMatchObject({ deliveryMinor: 0, deliveryBenefit: { offerId: offer.id, state: "reserved" } });
  expect(await (await place(win)).json()).toEqual(order);
  await seller(headers, { action: "disable", revision: offer.revision }, `/${offer.id}`);
  const change = (amountMinor: number, expectedRevision: number, key = crypto.randomUUID()) =>
    postAuth(
      `/api/seller/orders/${order.number}/transition?store=lavka`,
      { action: "setDeliveryFee", amountMinor, expectedRevision },
      { ...headers, "Idempotency-Key": key },
    );
  const key = crypto.randomUUID();
  const paid = await change(12000, 0, key);
  expect(paid.status).toBe(200);
  expect(await paid.json()).toMatchObject({
    deliveryMinor: 0,
    totalMinor: order.itemsMinor,
    deliveryBenefit: { amountMinor: 12000, state: "applied" },
    balance: { outstandingMinor: order.itemsMinor },
  });
  expect((await change(12000, 0, key)).status).toBe(200);
  expect((await change(12000, 0)).status).toBe(409);
  expect(await catalogSql("SELECT amount_minor,released_at FROM promo_uses")).toEqual([
    { amount_minor: 12000, released_at: null },
  ]);
  // A correction to zero releases the right while the order remains unpaid.
  expect((await change(0, 1)).status).toBe(200);
  expect((await catalogSql("SELECT released_at FROM promo_uses"))[0].released_at).not.toBeNull();
  const cancelled = await buy(`orders/${order.number}/cancel`, { expectedVersion: 2 }, cookies[win]);
  expect(cancelled.status).toBe(200);
  expect((await change(12000, 3)).status).toBe(409);
});

it("A6 §9.1 §12E · два независимых кода, одна автоматическая запись, права/магазин/версия/повтор", async () => {
  await tariff(12000);
  const { headers } = await sellerFixture(shop);
  const automatic = {
    ...terms,
    kind: "automatic",
    code: undefined,
    totalLimit: undefined,
    minimumMinor: 60000,
  } as const;
  const auto = await (await seller(headers, { action: "publish", revision: 0, terms: automatic })).json<PromoOffer>();
  const a = await (await seller(headers, { action: "publish", revision: 0, terms })).json<PromoOffer>();
  const b = await (
    await seller(headers, { action: "publish", revision: 0, terms: { ...terms, code: "SECOND" } })
  ).json<PromoOffer>();
  expect((await seller(headers, { action: "publish", revision: 0, terms: automatic })).status).toBe(409);
  expect(await (await getAuth("/api/seller/promotions/delivery-policy?store=lavka", headers)).json()).toEqual({
    offer: auto,
  });
  const key = crypto.randomUUID();
  const disabled = await seller(headers, { action: "disable", revision: 1 }, `/${a.id}`, key);
  expect(disabled.status).toBe(200);
  expect((await seller(headers, { action: "disable", revision: 1 }, `/${a.id}`, key)).status).toBe(200);
  expect((await seller(headers, { action: "publish", revision: 0, terms }, `/${a.id}`)).status).toBe(409);
  expect(await (await getAuth(`/api/seller/promotions/${b.id}?store=lavka`, headers)).json()).toMatchObject({
    revision: 1,
    status: "active",
  });
  await tariff(20000);
  expect(await (await getAuth("/api/seller/promotions/delivery-policy?store=lavka", headers)).json()).toEqual({
    offer: auto,
  });
  const employee = (await sellerFixture(shop, "employee", ["products"])).headers;
  expect((await getAuth("/api/seller/promotions/delivery-policy?store=lavka", employee)).status).toBe(403);
  expect((await getAuth(`/api/seller/promotions/${auto.id}?store=test2`, headers)).status).toBe(403);
});

it("A6 §10A–E §12G · готовый актуальный пример изолирован от корзины, остатков, заказов и лимитов", async () => {
  await tariff(12000);
  const { headers } = await sellerFixture(shop);
  const cookie = await customer("sku-01");
  const real = await readCart(cookie);
  const state = () =>
    catalogSql(`SELECT (SELECT json_group_array(json_object('id',id,'stock',stock)) FROM variants) AS stock,
    (SELECT COUNT(*) FROM orders) AS orders,(SELECT COUNT(*) FROM promo_uses) AS uses,
    (SELECT COUNT(*) FROM carts) AS carts,(SELECT COUNT(*) FROM promo_offers) AS offers`);
  const before = await state();
  const example = async (changes: Partial<PromoTerms> = {}) => {
    const response = await seller(
      { ...headers, Cookie: cookie },
      {
        terms: { ...terms, ...changes },
        automatic: true,
        enteredCode: changes.kind === "automatic" ? null : "SHIP",
        confirmed: false,
        completed: 0,
        lines: [],
      },
      "/example",
    );
    expect(response.status).toBe(200);
    return response.json<Cart & { exampleProblem: string | null; payableMinor: number }>();
  };
  const ready = await example({ minimumMinor: 60000 });
  expect(ready.exampleProblem).toBeNull();
  expect(ready.itemsMinor).toBeGreaterThanOrEqual(60000);
  expect(ready.delivery?.benefit?.code).toBe("SHIP");
  const updated = await example({ minimumMinor: 150000 });
  expect(updated.itemsMinor).toBeGreaterThanOrEqual(150000);
  const automatic = await example({ kind: "automatic", code: undefined, totalLimit: undefined, minimumMinor: 60000 });
  expect(automatic.promo?.code).toBeUndefined();
  expect(automatic.delivery?.benefit?.code).toBeUndefined();
  expect(await readCart(cookie)).toEqual(real);
  expect(await state()).toEqual(before);
  await catalogSql("UPDATE variants SET stock=0");
  expect((await example()).exampleProblem).toBeTruthy();
});

it("A6 §7.9–10 · снятие товара после заказа сохраняет льготу; отчёт учитывает только основание реальной скидки", async () => {
  await tariff(12000);
  await catalogSql("UPDATE catalog_state SET currency='RUB'");
  await catalogSql(
    "UPDATE variants SET visible=1,stock=20,old_price_minor=NULL,price_minor=CASE id WHEN 'sku-01' THEN 55000 ELSE 5000 END WHERE id IN ('sku-01','sku-02')",
  );
  const { headers } = await sellerFixture(shop);
  const auto = await (
    await seller(headers, {
      action: "publish",
      revision: 0,
      terms: { ...terms, code: undefined, kind: "automatic", totalLimit: undefined, minimumMinor: 60000 },
    })
  ).json<PromoOffer>();
  const code = await (await seller(headers, { action: "publish", revision: 0, terms })).json<PromoOffer>();
  const cookie = await customer("sku-01", address);
  await buy("cart", { variantId: "sku-02", quantity: 1, expectedRevision: (await readCart(cookie)).revision }, cookie);
  const priced = await apply(cookie);
  expect(priced.delivery?.benefit?.offerId).toBe(auto.id);
  expect(priced.delivery?.benefit?.code).toBeUndefined();
  const quote = await getQuote(cookie);
  const result = await buy("checkout", { payment: "cash", quoteRevision: quote.quoteRevision }, cookie);
  expect(result.status).toBe(201);
  const order = await result.json<OrderResult>();
  const path = `/api/seller/orders/${order.number}`;
  const transition = (body: object) => postAuth(`${path}/transition?store=lavka`, body, headers);
  expect((await transition({ action: "accept", expectedRevision: 0 })).status).toBe(200);
  const edits = { expectedVersion: 1, edits: [{ kind: "unavailable", lineId: "sku-02", quantity: 0 }] };
  const preview = await postAuth(`${path}/composition/quote?store=lavka`, edits, headers);
  expect(preview.status).toBe(200);
  const change = await preview.json<{ quote: string }>();
  const removed = await postAuth(`${path}/composition?store=lavka`, { ...edits, quote: change.quote }, headers);
  expect(removed.status).toBe(200);
  expect(await (await getAuth(`/api/orders/${order.number}?shop=lavka`, { Cookie: cookie })).json()).toMatchObject({
    itemsMinor: 55000,
    deliveryMinor: 0,
    totalMinor: 55000,
    deliveryBenefit: { offerId: auto.id, amountMinor: 12000 },
  });
  await catalogSql("UPDATE orders SET status='completed' WHERE number=?", order.number);
  await catalogSql(
    "INSERT INTO buyer_order_events(order_number,actor,event,created_at) VALUES(?,'fixture','order.complete',?)",
    order.number,
    Date.now(),
  );
  expect(await (await getAuth(`/api/seller/promotions/${auto.id}/report?store=lavka`, headers)).json()).toMatchObject({
    orderCount: 1,
    savingsMinor: 12000,
    itemsMinor: 55000,
    thresholdCount: 1,
  });
  expect(await (await getAuth(`/api/seller/promotions/${code.id}/report?store=lavka`, headers)).json()).toMatchObject({
    orderCount: 0,
    savingsMinor: 0,
  });
  expect(await catalogSql("SELECT offer_id,amount_minor FROM promo_uses WHERE order_number=?", order.number)).toEqual([
    { offer_id: auto.id, amount_minor: 12000 },
  ]);
});
