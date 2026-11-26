import { expect, it } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import type { OrderResult } from "../../../src/shared/contracts/checkout";
import type { PromoOffer, PromoTerms } from "../../../src/shared/contracts/promo";
import { getAuth, sellerFixture } from "../../testing/auth";
import { catalogSql } from "../catalog/testing";
import { buy, customer, getQuote } from "../checkout/testing";
import { readCart, seller, shop } from "./cart-followup-fixture";

const common = {
  name: "Завтрак",
  kind: "automatic",
  confirmed: false,
  discount: { type: "fixed", value: 0 },
  scope: { type: "all" },
} as const;

it("12.2 · одна команда добавляет комплект, два применения сохраняются в заказе и отражаются раздельно", async () => {
  await catalogSql(`UPDATE variants SET visible=1,stock=10,old_price_minor=NULL,
    price_minor=CASE id WHEN 'sku-01' THEN 15000 ELSE 10000 END WHERE id IN ('sku-01','sku-02')`);
  const { headers } = await sellerFixture(shop);
  const terms: PromoTerms = {
    ...common,
    kind: "code",
    code: "BREAKFAST",
    publicInCart: true,
    group: {
      type: "bundle",
      priceMinor: 22000,
      limit: 2,
      components: [
        { variantId: "sku-01", quantity: 1 },
        { variantId: "sku-02", quantity: 1 },
      ],
    },
  };
  const publish = async (terms: PromoTerms) => {
    const response = await seller(headers, { action: "publish", revision: 0, terms });
    expect(response.status).toBe(200);
    return response.json<PromoOffer>();
  };
  const combo = await publish(terms);
  const extra = await publish({ ...common, name: "На оставшиеся товары", discount: { type: "percent", value: 100 } });
  const Cookie = await customer("sku-01");
  const before = await readCart(Cookie);
  expect(before.promo?.groupHints).toMatchObject([
    { id: combo.id, missing: [{ variantId: "sku-02", quantity: 1 }], code: "BREAKFAST" },
  ]);
  const args = {
    expectedRevision: before.revision,
    addItems: [
      { variantId: "sku-01", quantity: 2 },
      { variantId: "sku-02", quantity: 3 },
    ],
  };
  const key = crypto.randomUUID();
  const res = await buy("cart", args, Cookie, key);
  expect(res.status).toBe(200);
  const after = await res.json<Cart>();
  expect(await (await buy("cart", args, Cookie, key)).json()).toEqual(after);
  expect(after.lines.map(({ quantity }) => quantity)).toEqual([3, 3]);
  const applied = await buy(
    "cart",
    { promoAction: "apply", code: "BREAKFAST", publicOfferId: combo.id, expectedRevision: after.revision },
    Cookie,
  );
  expect(applied.status).toBe(200);
  expect(await applied.json()).toMatchObject({ totalMinor: 68750, promo: { reason: "applied" } });
  const quote = await getQuote(Cookie);
  const placed = await buy("checkout", { payment: "cash", quoteRevision: quote.quoteRevision }, Cookie);
  expect(placed.status).toBe(201);
  const order = await placed.json<OrderResult>();
  expect(order.itemsMinor).toBe(68750);
  expect(order.lines.reduce((sum, line) => sum + line.totalMinor, 0)).toBe(order.itemsMinor);
  expect(
    await catalogSql(
      "SELECT offer_id,amount_minor FROM promo_uses WHERE order_number=? ORDER BY amount_minor DESC",
      order.number,
    ),
  ).toEqual([
    { offer_id: combo.id, amount_minor: 6000 },
    { offer_id: extra.id, amount_minor: 250 },
  ]);
  await catalogSql("UPDATE orders SET status='completed' WHERE number=?", order.number);
  await catalogSql(
    "INSERT INTO buyer_order_events(order_number,actor,event,created_at) VALUES(?,'test','order.complete',?)",
    order.number,
    Date.now() - 100,
  );
  const report = await getAuth(`/api/seller/promotions/${combo.id}/report?store=lavka`, headers);
  expect(report.status).toBe(200);
  expect(await report.json()).toMatchObject({
    orderCount: 1,
    groups: { type: "bundle", count: 2 },
    savingsMinor: 6000,
    orders: [{ number: order.number, savingMinor: 6000 }],
  });
  for (const itemsMinor of [10_000, order.itemsMinor]) {
    await catalogSql(
      "UPDATE orders SET fulfillment_state=? WHERE number=?",
      JSON.stringify({ finance: { salesRefund: { itemsMinor, deliveryMinor: 0 } } }),
      order.number,
    );
    const refunded = await getAuth(`/api/seller/promotions/${combo.id}/report?store=lavka`, headers);
    expect(await refunded.json()).toMatchObject({
      itemsMinor: order.itemsMinor - itemsMinor,
      savingsMinor: itemsMinor === order.itemsMinor ? 0 : 6000,
      groups: { type: "bundle", count: 2 },
    });
  }
});

it("12.2 · закрытый код не виден в каталоге и примере другого покупателя, нулевой остаток не даёт подарка", async () => {
  const { headers } = await sellerFixture(shop);
  await catalogSql("UPDATE variants SET stock=2,price_minor=60000 WHERE id='sku-01'");
  const terms: PromoTerms = {
    ...common,
    name: "2+1",
    scope: { type: "variants", ids: ["sku-01"] },
    group: { type: "gift", buy: 2, gift: 1, limit: 2 },
  };
  expect((await seller(headers, { action: "publish", revision: 0, terms })).status).toBe(200);
  const Cookie = await customer("sku-01");
  const two = await readCart(Cookie);
  const tooMany = await buy(
    "cart",
    { expectedRevision: two.revision, addItems: [{ variantId: "sku-01", quantity: 2 }] },
    Cookie,
  );
  expect(tooMany.status).toBe(409);
  expect(await readCart(Cookie)).toMatchObject({ totalMinor: 60000, adjustments: [] });
  await catalogSql("UPDATE variants SET stock=25 WHERE id='sku-01'");
  const example = await seller(
    headers,
    { terms, lines: [{ variantId: "sku-01", quantity: 6 }], confirmed: false, completed: 0 },
    "/example",
  );
  expect(example.status).toBe(200);
  expect(await example.json()).toMatchObject({ totalMinor: 240000, adjustments: [{ allocations: [{ gifts: 2 }] }] });
  expect(await readCart(Cookie)).toMatchObject({ totalMinor: 60000, count: 1 });

  await catalogSql("UPDATE variants SET stock=10,visible=1 WHERE id='sku-02'");
  const hidden: PromoTerms = {
    ...common,
    kind: "code",
    code: "PRIVATE",
    group: {
      type: "bundle",
      priceMinor: 1,
      components: [
        { variantId: "sku-01", quantity: 1 },
        { variantId: "sku-02", quantity: 1 },
      ],
    },
  };
  expect((await seller(headers, { action: "publish", revision: 0, terms: hidden })).status).toBe(200);
  const live = await getAuth("/api/catalog/live?shop=lavka&ids=sku-01,sku-02", { Cookie });
  expect(live.status).toBe(200);
  expect(await live.text()).not.toContain("PRIVATE");
  const publicOffers = await getAuth("/api/cart/promotions?shop=lavka", { Cookie });
  expect(await publicOffers.json()).toEqual([]);
});

it("12.2 · D3: два уменьшения каждого товара сохраняют порядок строк при пересчёте набора", async () => {
  await catalogSql(`UPDATE variants SET visible=1,stock=10,old_price_minor=NULL,
    price_minor=CASE id WHEN 'sku-01' THEN 15000 ELSE 10000 END WHERE id IN ('sku-01','sku-02')`);
  const { headers } = await sellerFixture(shop);
  const terms: PromoTerms = {
    ...common,
    group: {
      type: "bundle",
      priceMinor: 22000,
      limit: 3,
      components: [
        { variantId: "sku-01", quantity: 1 },
        { variantId: "sku-02", quantity: 1 },
      ],
    },
  };
  expect((await seller(headers, { action: "publish", revision: 0, terms })).status).toBe(200);
  const Cookie = await customer("sku-01");
  let revision = (await readCart(Cookie)).revision;
  const set = async (variantId: string, quantity: number) => {
    const response = await buy("cart", { variantId, quantity, expectedRevision: revision }, Cookie);
    expect(response.status).toBe(200);
    const cart = await response.json<Cart>();
    revision = cart.revision;
    return cart;
  };
  await set("sku-01", 3);
  await set("sku-02", 3);
  for (const [variantId, quantity, first, second, totalMinor, groups] of [
    ["sku-01", 2, 2, 3, 54000, 2],
    ["sku-01", 1, 1, 3, 42000, 1],
    ["sku-02", 2, 1, 2, 32000, 1],
    ["sku-02", 1, 1, 1, 22000, 1],
  ] as const) {
    const cart = await set(variantId, quantity);
    expect(cart).toMatchObject({
      lines: [
        { variantId: "sku-01", quantity: first },
        { variantId: "sku-02", quantity: second },
      ],
      totalMinor,
      adjustments: [{ groups: { count: groups } }],
    });
    expect((await readCart(Cookie)).lines).toEqual(cart.lines);
  }
});
