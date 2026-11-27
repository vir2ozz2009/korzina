import { expect, it } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import type { PromoOffer, PromoTerms } from "../../../src/shared/contracts/promo";
import { getAuth, sellerFixture } from "../../testing/auth";
import { catalogSql } from "../catalog/testing";
import { buy, customer } from "../checkout/testing";
import { readCart, seller, shop, terms } from "./cart-followup-fixture";

it("§5.3 пример считает 1200 → 1080 → 1200, применяет порог и не меняет рабочие данные", async () => {
  const { headers } = await sellerFixture(shop);
  const draft = {
    ...terms,
    code: "DRAFT10",
    discount: { type: "percent", value: 1000 },
    minimumMinor: 40_000,
    publicInCart: true,
    personalLimit: 1,
  } as const;
  const persisted = await seller(headers, { action: "draft", revision: 0, terms: draft });
  expect(persisted.status).toBe(200);
  const offer = await persisted.json<PromoOffer>();
  await catalogSql(
    "UPDATE variants SET stock=25,visible=1,old_price_minor=NULL,price_minor=CASE id WHEN 'sku-01' THEN 8000 ELSE 28000 END WHERE id IN ('sku-01','sku-02')",
  );
  const Cookie = await customer("sku-01");
  const snapshot = () =>
    catalogSql(
      "SELECT (SELECT COUNT(*) FROM orders) AS orders,(SELECT COUNT(*) FROM promo_uses) AS uses,(SELECT COUNT(*) FROM carts) AS carts",
    );
  const start = await snapshot();
  const preview = (
    enteredCode: string | null,
    berry = 4,
    confirmed = true,
    changes: Partial<PromoTerms> = {},
    publicOfferId?: string,
  ) => {
    return seller(
      { ...headers, Cookie },
      {
        terms: { ...draft, ...changes },
        enteredCode,
        publicOfferId,
        confirmed,
        completed: 0,
        lines: [
          { variantId: "sku-01", quantity: 1 },
          { variantId: "sku-02", quantity: berry },
        ],
      },
      "/example",
    );
  };
  const example = async (...args: Parameters<typeof preview>) => {
    const response = await preview(...args);
    expect(response.status).toBe(200);
    return response.json<Cart>();
  };
  await catalogSql("UPDATE catalog_state SET currency='RUB' WHERE id=1");
  const realBefore = await readCart(Cookie);
  expect(await example(null)).toMatchObject({
    currency: "RUB",
    itemsMinor: 120_000,
    totalMinor: 120_000,
    deliveryMinor: 0,
    adjustments: [],
    publicOffers: [{ id: "example", code: draft.code, scopeNames: ["Все товары"], applicable: true }],
  });
  expect(await example("DRAFT10", 4, true, {}, "example")).toMatchObject({
    totalMinor: 108_000,
    adjustments: [{ amount: -12_000 }],
    lines: [{ totalMinor: 7200 }, { totalMinor: 100_800 }],
    promo: { reason: "applied" },
  });
  expect(await example("DRAFT10", 1)).toMatchObject({
    totalMinor: 36_000,
    promo: { reason: "minimum", missingMinor: 4000 },
    publicOffers: [{ id: "example", applicable: false, missingMinor: 4000 }],
  });
  expect(await example("DRAFT10", 4, false)).toMatchObject({
    totalMinor: 120_000,
    promo: { reason: "telegram" },
    publicOffers: [],
  });
  const forEveryone = { personalLimit: undefined };
  for (const confirmed of [false, true]) {
    expect(await example(null, 4, confirmed, forEveryone)).toMatchObject({
      totalMinor: 120_000,
      publicOffers: [{ code: draft.code, applicable: true }],
    });
    const hidden = { ...forEveryone, publicInCart: false };
    expect(await example("DRAFT10", 4, confirmed, hidden)).toMatchObject({
      totalMinor: 108_000,
      promo: { reason: "applied" },
      publicOffers: [],
    });
    expect((await preview("DRAFT10", 4, confirmed, hidden, "example")).status).toBe(400);
  }
  expect((await preview("DRAFT10", 1, true, {}, "example")).status).toBe(400);
  expect(await (await getAuth("/api/cart/promotions?shop=lavka", { Cookie })).json()).toEqual([]);
  expect(await example("DRAFT10")).toMatchObject({ totalMinor: 108_000 });
  expect(await example(null)).toMatchObject({ totalMinor: 120_000, adjustments: [] });
  expect(await example("WRONG")).toMatchObject({ totalMinor: 120_000, promo: { reason: "unknown" } });
  expect(
    (await buy("cart", { promoAction: "apply", code: draft.code, expectedRevision: realBefore.revision }, Cookie))
      .status,
  ).toBe(400);
  expect(await readCart(Cookie)).toEqual(realBefore);
  expect(await snapshot()).toEqual(start);
  expect(await (await getAuth(`/api/seller/promotions/${offer.id}?store=lavka`, headers)).json()).toMatchObject({
    revision: offer.revision,
    status: "draft",
    used: 0,
    terms: draft,
  });
  await catalogSql("UPDATE catalog_state SET currency='VND' WHERE id=1");
  expect(await example("DRAFT10")).toMatchObject({ currency: "VND", totalMinor: 108_000 });
});

it("PROMO-EXAMPLE-TRANSFER · сервер готовит товары и учебную покупку из условий без записи в личную корзину", async () => {
  const { headers } = await sellerFixture(shop);
  const Cookie = await customer("sku-01");
  const before = await readCart(Cookie);
  const preview = async (changes: Partial<PromoTerms> = {}) => {
    const response = await seller(
      { ...headers, Cookie },
      {
        terms: {
          ...terms,
          scope: { type: "variants", ids: ["sku-01"] },
          minimumMinor: 100000,
          purchase: { mode: "exact", number: 3 },
          ...changes,
        },
        enteredCode: "HOT",
        automatic: true,
        lines: [],
        confirmed: false,
        completed: 0,
      },
      "/example",
    );
    expect(response.status).toBe(200);
    return response.json<Cart & { completed: number; confirmed: boolean; exampleProblem: string | null }>();
  };
  const prepared = await preview();
  expect(prepared).toMatchObject({
    completed: 2,
    confirmed: true,
    exampleProblem: null,
    promo: { code: "HOT", reason: "applied" },
    lines: [{ variantId: "sku-01", quantity: 3 }],
  });
  expect((await preview({ minimumMinor: 200000 })).lines[0].quantity).toBe(5);
  expect((await preview({ throughDate: "2020-01-01" })).promo?.reason).toBe("expired");
  expect(await readCart(Cookie)).toEqual(before);
  expect(await catalogSql("SELECT COUNT(*) AS n FROM promo_uses")).toEqual([{ n: 0 }]);
});
