import { expect, it } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import { sellerFixture } from "../../testing/auth";
import { catalogSql } from "../catalog/testing";
import { buy, customer } from "../checkout/testing";
import { readCart, seller, shop, terms } from "./cart-followup-fixture";

it("A6 · замена кода доставки на товарный и обратно сравнивает полный тариф", async () => {
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='fulfillment'",
    JSON.stringify({
      delivery: { mode: "text", payee: "shop", tariff: { kind: "fixed", feeMinor: 12000 } },
    }),
  );
  const { headers } = await sellerFixture(shop);
  expect(
    (
      await seller(headers, {
        action: "publish",
        revision: 0,
        terms: { ...terms, code: "SHIP", delivery: true, discount: { type: "fixed", value: 0 } },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await seller(headers, {
        action: "publish",
        revision: 0,
        terms: { ...terms, code: "GOODS", discount: { type: "fixed", value: 5000 } },
      })
    ).status,
  ).toBe(200);
  const cookie = await customer("sku-01", { mode: "delivery", address: "Учебный адрес", apartment: "1" });
  const command = async (body: object) =>
    buy("cart", { ...body, expectedRevision: (await readCart(cookie)).revision }, cookie);
  expect((await command({ promoAction: "apply", code: "SHIP" })).status).toBe(200);
  const comparison = await (await command({ promoAction: "compare", code: "GOODS" })).json<Cart>();
  expect(comparison.promo?.alternative).toMatchObject({ totalMinor: 44000, deliveryMinor: 12000 });
  expect(
    (await command({ promoAction: "apply", code: "GOODS", comparedTotal: 44000, comparedDeliveryMinor: 0 })).status,
  ).toBe(409);
  expect(
    (await command({ promoAction: "apply", code: "GOODS", comparedTotal: 44000, comparedDeliveryMinor: 12000 })).status,
  ).toBe(200);
  const back = await (await command({ promoAction: "compare", code: "SHIP" })).json<Cart>();
  expect(back.promo?.alternative).toMatchObject({ totalMinor: 49000, deliveryMinor: 0 });
  expect(
    (await command({ promoAction: "apply", code: "SHIP", comparedTotal: 49000, comparedDeliveryMinor: 0 })).status,
  ).toBe(200);
});
