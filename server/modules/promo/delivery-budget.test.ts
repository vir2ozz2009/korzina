import { expect, it } from "vitest";
import { resolveFeatures } from "../../../src/shared/flags";
import { assertSqlBudget, type SqlMetrics } from "../../metrics";
import { sellerFixture } from "../../testing/auth";
import { catalogSql, catalogStub } from "../catalog/testing";
import { buy, customer, getQuote } from "../checkout/testing";
import { readCart, seller, shop } from "./cart-followup-fixture";

it.each([
  { name: "товарный код 12.1", fee: 12000, payee: "shop", pickup: false, reserved: 1, goods: true },
  { name: "поздний тариф", fee: null, payee: "shop", pickup: false, reserved: 1 },
  { name: "исходный ноль", fee: 0, payee: "shop", pickup: false, reserved: 0 },
  { name: "прямой платёж", fee: 12000, payee: "courier", pickup: false, reserved: 0 },
  { name: "самовывоз", fee: 12000, payee: "shop", pickup: true, reserved: 0 },
])(
  "A6 §6.2–3 · $name: бюджет корзины/оформления и только применимый резерв",
  async ({ fee, payee, pickup, reserved, goods }) => {
    await catalogSql(
      "UPDATE settings SET value=? WHERE key='fulfillment'",
      JSON.stringify({
        delivery: {
          mode: "text",
          payee,
          tariff:
            fee === null ? { kind: "after_order" } : fee === 0 ? { kind: "free" } : { kind: "fixed", feeMinor: fee },
        },
        pickup: { address: "Самовывоз", hours: "09:00–20:00" },
      }),
    );
    const { headers } = await sellerFixture(shop);
    expect(
      (
        await seller(headers, {
          action: "publish",
          revision: 0,
          terms: {
            name: "Доставка",
            kind: "code",
            code: "SHIP",
            delivery: !goods,
            confirmed: false,
            scope: { type: "all" },
            discount: { type: "fixed", value: goods ? 7500 : 0 },
            totalLimit: 1,
          },
        })
      ).status,
    ).toBe(200);
    const Cookie = await customer(
      "sku-01",
      pickup ? { mode: "pickup" } : { mode: "delivery", address: "Учебный адрес", apartment: "1" },
    );
    expect(
      (
        await buy(
          "cart",
          { promoAction: "apply", code: "SHIP", expectedRevision: (await readCart(Cookie)).revision },
          Cookie,
        )
      ).status,
    ).toBe(200);
    const internal = (path: string, body?: object) =>
      catalogStub().fetch(
        new Request(`https://demo.korzina.app/api/${path}`, {
          method: body ? "POST" : "GET",
          headers: {
            Cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
            "x-korzina-shop": encodeURIComponent(
              JSON.stringify({
                id: shop,
                slug: "lavka",
                name: "Test",
                status: "active",
                plan: "base",
                createdAt: 0,
                features: resolveFeatures([]),
              }),
            ),
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    const cart = await internal("cart");
    expect(cart.status).toBe(200);
    assertSqlBudget(JSON.parse(cart.headers.get("x-korzina-sql") ?? "null") as SqlMetrics, {
      sql: 4,
      rowsRead: 15,
      rowsWritten: 0,
    });
    const quote = await getQuote(Cookie);
    const order = await internal("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" });
    expect(order.status).toBe(201);
    const metrics = JSON.parse(order.headers.get("x-korzina-sql") ?? "null") as SqlMetrics;
    // Same ceiling for the existing goods code and the delivery right, including their indexes.
    assertSqlBudget(metrics, { sql: 15, rowsRead: 38, rowsWritten: 24 });
    expect(await catalogSql("SELECT COUNT(*) AS n FROM promo_uses WHERE released_at IS NULL")).toEqual([
      { n: reserved },
    ]);
  },
);
