import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import type { OrderResult } from "../../../src/shared/contracts/checkout";
import type { PromoOffer, PromoTerms } from "../../../src/shared/contracts/promo";
import { shopContexts } from "../../platform/shop-context";
import { sellerFixture } from "../../testing/auth";
import { catalogSql } from "../catalog/testing";
import { buy, customer, getQuote } from "../checkout/testing";
import { retainedPromos } from "../order-changes/promo-lines";
import { readCart, seller, shop } from "./cart-followup-fixture";

const common = {
  name: "Комбо",
  kind: "automatic",
  confirmed: false,
  discount: { type: "fixed", value: 0 },
  scope: { type: "all" },
} as const;

it("FIX-PROMO-OPT · треугольник 450, пример 150, снимок и повтор оформления без повторного расхода", async () => {
  const ids = ["sku-01", "sku-02", "sku-03"];
  await catalogSql(`UPDATE variants SET visible=1,stock=10,old_price_minor=NULL,price_minor=100,
    promo_starts_at=NULL,promo_ends_at=NULL WHERE id IN ('sku-01','sku-02','sku-03')`);
  const { headers } = await sellerFixture(shop);
  const offers: PromoOffer[] = [];
  for (const pair of [
    [0, 1],
    [0, 2],
    [1, 2],
  ]) {
    const terms: PromoTerms = {
      ...common,
      name: `Набор ${pair.join("+")}`,
      group: {
        type: "bundle",
        priceMinor: 150,
        limit: null,
        components: pair.map((i) => ({ variantId: ids[i], quantity: 1 })),
      },
    };
    const published = await seller(headers, { action: "publish", revision: 0, terms });
    expect(published.status).toBe(200);
    offers.push(await published.json<PromoOffer>());
    // The seller example intentionally isolates ONE offer (existing 12.2 contract).
    const example = await seller(
      headers,
      { terms, lines: pair.map((i) => ({ variantId: ids[i], quantity: 1 })), confirmed: false, completed: 0 },
      "/example",
    );
    expect(await example.json()).toMatchObject({ totalMinor: 150 });
  }
  expect(
    (
      await seller(headers, {
        action: "publish",
        revision: 0,
        terms: {
          ...common,
          kind: "code",
          code: "LOSE",
          discount: { type: "fixed", value: 10 },
        },
      })
    ).status,
  ).toBe(200);
  const Cookie = await customer(ids[0]);
  const before = await readCart(Cookie);
  const response = await buy(
    "cart",
    { expectedRevision: before.revision, addItems: ids.map((variantId, i) => ({ variantId, quantity: i ? 2 : 1 })) },
    Cookie,
  );
  expect(response.status).toBe(200);
  const cart = await response.json<Cart>();
  expect(cart.totalMinor).toBe(450);
  expect(cart.adjustments).toHaveLength(3);
  await env.PLATFORM.prepare("UPDATE feature_overrides SET enabled=0 WHERE shop_id=? AND key='promotions'")
    .bind(shop)
    .run();
  shopContexts.invalidate(shop);
  expect(await readCart(Cookie)).toMatchObject({ totalMinor: 600, adjustments: [] });
  await env.PLATFORM.prepare("UPDATE feature_overrides SET enabled=1 WHERE shop_id=? AND key='promotions'")
    .bind(shop)
    .run();
  shopContexts.invalidate(shop);
  const enabled = await readCart(Cookie);
  const applied = await buy("cart", { promoAction: "apply", code: "LOSE", expectedRevision: enabled.revision }, Cookie);
  expect(await applied.json()).toMatchObject({ totalMinor: 450, promo: { reason: "better_automatic" } });
  const quote = await getQuote(Cookie);
  const key = crypto.randomUUID();
  const args = { payment: "cash", quoteRevision: quote.quoteRevision };
  const placed = await buy("checkout", args, Cookie, key);
  expect(placed.status).toBe(201);
  const order = await placed.json<OrderResult>();
  expect(order.itemsMinor).toBe(450);
  expect(order.lines.map(({ totalMinor }) => totalMinor)).toEqual([150, 150, 150]);
  expect(await (await buy("checkout", args, Cookie, key)).json()).toEqual(order);
  expect(await catalogSql("SELECT stock FROM variants WHERE id IN ('sku-01','sku-02','sku-03') ORDER BY id")).toEqual([
    { stock: 8 },
    { stock: 8 },
    { stock: 8 },
  ]);
  expect(
    await catalogSql(
      "SELECT COUNT(*) AS count,SUM(amount_minor) AS saved FROM promo_uses WHERE order_number=?",
      order.number,
    ),
  ).toEqual([{ count: 3, saved: 150 }]);
  await catalogSql("UPDATE promo_offers SET state='disabled'");
  const stored = await catalogSql("SELECT snapshot FROM orders WHERE number=?", order.number);
  const snapshot = JSON.parse(String(stored[0].snapshot));
  expect(snapshot.itemsMinor).toBe(450);
  for (const line of snapshot.lines) {
    const retained = [...retainedPromos(snapshot, line, 1).values()];
    expect(100 - retained.reduce((sum, part) => sum + part.amount, 0)).toBe(75);
    expect([...retainedPromos(snapshot, line, 0).values()].reduce((sum, part) => sum + part.amount, 0)).toBe(0);
  }
  expect(snapshot.adjustments.reduce((sum: number, a: { amount: number }) => sum - a.amount, 0)).toBe(150);
});
