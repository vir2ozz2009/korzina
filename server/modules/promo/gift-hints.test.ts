import { expect, it } from "vitest";
import { cartContract } from "../../../src/shared/contracts/cart";
import { sellerFixture } from "../../testing/auth";
import { catalogSql } from "../catalog/testing";
import { buy, customer } from "../checkout/testing";
import { readCart, seller, shop } from "./cart-followup-fixture";

it.each([false, true])("#315 · GET и изменения 1 → 2 → 3 → 2, обычная скидка: %s", async (discount) => {
  await catalogSql("UPDATE variants SET visible=1,stock=10,old_price_minor=NULL,price_minor=60000 WHERE id='sku-01'");
  const { headers } = await sellerFixture(shop);
  const common = {
    kind: "automatic",
    confirmed: false,
    scope: { type: "variants", ids: ["sku-01"] },
  };
  const publish = (terms: object) => seller(headers, { action: "publish", revision: 0, terms });
  expect(
    (
      await publish({
        ...common,
        name: "2+1",
        discount: { type: "fixed", value: 0 },
        group: { type: "gift", buy: 2, gift: 1 },
      })
    ).status,
  ).toBe(200);
  if (discount)
    expect((await publish({ ...common, name: "Скидка 10%", discount: { type: "percent", value: 1000 } })).status).toBe(
      200,
    );
  const variantId = "sku-01";
  const Cookie = await customer(variantId);
  let cart = await readCart(Cookie);
  for (const quantity of [1, 2, 3, 2]) {
    if (cart.count !== quantity) {
      const change = quantity === 3 ? { addItems: [{ variantId, quantity: 1 }] } : { variantId, quantity };
      const response = await buy("cart", { ...change, expectedRevision: cart.revision }, Cookie);
      expect(response.status).toBe(200);
      cart = cartContract.parse(await response.json());
      expect(cartContract.parse(await readCart(Cookie))).toEqual(cart);
    }
    expect(cart.lines).toMatchObject([{ variantId, quantity }]);
    expect(cart.totalMinor).toBe(quantity === 3 ? 120_000 : (discount ? 54_000 : 60_000) * quantity);
    if (quantity === 3) {
      expect(cart.promo?.groupHints).toBeUndefined();
      expect(cart.adjustments).toMatchObject([{ allocations: [{ variantId, gifts: 1 }] }]);
    } else {
      expect(cart.promo?.groupHints).toMatchObject([
        { giftQuantity: 1, missing: [{ variantId, quantity: 3 - quantity }] },
      ]);
      expect(cart.adjustments.flatMap((adjustment) => adjustment.allocations ?? []).some((part) => part.gifts)).toBe(
        false,
      );
    }
  }
});
