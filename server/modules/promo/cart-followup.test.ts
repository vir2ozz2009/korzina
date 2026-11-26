import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, expect, it } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import type { PromoOffer, PromoTerms } from "../../../src/shared/contracts/promo";
import { customerCookie } from "../../auth/cookies";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { prepareCustomer } from "../auth/service";
import { catalogSql, shopCatalogSql } from "../catalog/testing";
import { buy, customer, setupCheckout } from "../checkout/testing";

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
it("§5.2 выдаёт только публичные акции своего магазина и повторно проверяет их при сравнении и применении", async () => {
  const { headers } = await sellerFixture(shop);
  const publicTerms = {
    ...terms,
    code: "PUBLIC",
    publicInCart: true,
    minimumMinor: 50_000,
    scope: { type: "variants" as const, ids: ["sku-01"] },
  };
  const send = async (terms: PromoTerms, suffix = "", revision = 0) => {
    const response = await seller(headers, { action: "publish", revision, terms }, suffix);
    expect(response.status).toBe(200);
    return response.json<PromoOffer>();
  };
  const hidden = await send(terms);
  expect(hidden.terms.publicInCart).toBe(false);
  const shown = await send(publicTerms);
  await send({ ...terms, code: "PRIVATE", publicInCart: true, confirmed: true });
  const { publicInCart: _omitted, ...legacyTerms } = publicTerms;
  const edited = await send(legacyTerms, `/${shown.id}`, 1);
  expect(edited.terms.publicInCart).toBe(true);
  const Cookie = await customer("sku-01");
  const list = () => getAuth("/api/cart/promotions?shop=lavka", { Cookie });
  expect(await (await list()).json()).toMatchObject([{ id: shown.id, applicable: false, missingMinor: 1000 }]);
  const atThreshold = await buy(
    "cart",
    {
      variantId: "sku-01",
      quantity: 2,
      expectedRevision: (await readCart(Cookie)).revision,
    },
    Cookie,
  );
  expect(atThreshold.status).toBe(200);
  const [publicOffer] = await (await list()).json<Record<string, unknown>[]>();
  expect(publicOffer).toMatchObject({
    id: shown.id,
    applicable: true,
    code: "PUBLIC",
    scopeNames: [expect.any(String)],
  });
  for (const key of ["terms", "totalLimit", "personalUsed", "orders", "actor", "revision"])
    expect(publicOffer).not.toHaveProperty(key);
  const manual = await buy(
    "cart",
    { promoAction: "apply", code: "HOT", expectedRevision: (await atThreshold.json<Cart>()).revision },
    Cookie,
  );
  expect(await manual.json()).toMatchObject({ promo: { code: "HOT", reason: "applied" } });
  const prior = await readCart(Cookie);
  const request = { code: "PUBLIC", publicOfferId: shown.id, expectedRevision: prior.revision };
  const comparison = await buy("cart", { ...request, promoAction: "compare" }, Cookie);
  expect(await comparison.json()).toMatchObject({ promo: { alternative: { code: "PUBLIC", totalMinor: 90_500 } } });
  expect(await readCart(Cookie)).toEqual(prior);
  await send({ ...legacyTerms, publicInCart: false }, `/${shown.id}`, 2);
  expect(await (await list()).json()).toEqual([]);
  const stale = await buy("cart", { ...request, promoAction: "apply", comparedTotal: 90_500 }, Cookie);
  expect(stale.status).toBe(400);
  expect(await readCart(Cookie)).toEqual(prior);
});
it("§5.2 публичный добор меняется на скидку и обратно, а аккаунт и магазин меняют выдачу", async () => {
  const { headers } = await sellerFixture(shop);
  const automatic = {
    ...terms,
    kind: "automatic",
    code: undefined,
    publicInCart: true,
    minimumMinor: 80_000,
    confirmed: true,
  };
  const row = await (await seller(headers, { action: "publish", revision: 0, terms: automatic })).json<PromoOffer>();
  const publicCode = { ...terms, code: "SAME", publicInCart: true };
  expect((await seller(headers, { action: "publish", revision: 0, terms: publicCode })).status).toBe(200);
  const other = "korzina-demo-test2";
  const second = await sellerFixture(other);
  const secondResponse = await seller(
    second.headers,
    { action: "publish", revision: 0, terms: { ...publicCode, name: "Только второй магазин" } },
    "",
    crypto.randomUUID(),
    "test2",
  );
  expect(secondResponse.status).toBe(200);
  const secondOffer = await secondResponse.json<PromoOffer>();
  const guest = await customer("sku-01");
  const request = (Cookie: string, slug = "lavka") => getAuth(`/api/cart/promotions?shop=${slug}`, { Cookie });
  expect(await (await request(guest)).json()).toMatchObject([{ code: "SAME", name: terms.name }]);
  const verified = await prepareCustomer("telegram:4567", "telegram");
  await catalogSql(
    "INSERT INTO sessions(token_hash,subject,kind,expires_at) VALUES(?,?,?,?)",
    verified.tokenHash,
    verified.session.subject,
    verified.session.kind,
    verified.session.expiresAt,
  );
  const Cookie = `${customerCookie(shop)}=${verified.token}`;
  const setQuantity = async (quantity: number) => {
    const response = await buy(
      "cart",
      { variantId: "sku-01", quantity, expectedRevision: (await readCart(Cookie)).revision },
      Cookie,
    );
    expect(response.status).toBe(200);
    return response.json<Cart>();
  };
  expect(await setQuantity(1)).toMatchObject({ promo: { hint: { publicOfferId: row.id, missingMinor: 31_000 } } });
  expect(await (await request(Cookie)).json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: row.id, applicable: false })]),
  );
  expect(await setQuantity(2)).toMatchObject({ totalMinor: 90_500, adjustments: [{ sourceId: row.id }] });
  expect(await setQuantity(1)).toMatchObject({ totalMinor: 49_000, promo: { hint: { publicOfferId: row.id } } });
  await catalogSql("UPDATE promo_offers SET ends_at=? WHERE id=?", Date.now() - 1, row.id);
  expect(await (await request(Cookie)).json()).toMatchObject([{ code: "SAME", name: terms.name }]);
  const secondSession = await prepareCustomer();
  await shopCatalogSql(
    "INSERT INTO sessions(token_hash,subject,kind,expires_at) VALUES(?,?,?,?)",
    [
      secondSession.tokenHash,
      secondSession.session.subject,
      secondSession.session.kind,
      secondSession.session.expiresAt,
    ],
    other,
  );
  const otherCookie = `${customerCookie(other)}=${secondSession.token}`;
  expect(
    (
      await postAuth(
        "/api/cart?shop=test2",
        { variantId: "sku-01", quantity: 1, expectedRevision: 0 },
        { Cookie: otherCookie },
      )
    ).status,
  ).toBe(200);
  expect(await (await request(otherCookie, "test2")).json()).toMatchObject([
    { id: secondOffer.id, code: "SAME", name: "Только второй магазин" },
  ]);
});
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
  const example = async (enteredCode: string | null, berry = 4, confirmed = true) => {
    const response = await seller(
      headers,
      {
        terms: draft,
        enteredCode,
        confirmed,
        completed: 0,
        lines: [
          { variantId: "sku-01", quantity: 1 },
          { variantId: "sku-02", quantity: berry },
        ],
      },
      "/example",
    );
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
  });
  expect(await example("DRAFT10")).toMatchObject({
    totalMinor: 108_000,
    adjustments: [{ amount: -12_000 }],
    lines: [{ totalMinor: 7200 }, { totalMinor: 100_800 }],
    promo: { reason: "applied" },
  });
  expect(await example("DRAFT10", 1)).toMatchObject({
    totalMinor: 36_000,
    promo: { reason: "minimum", missingMinor: 4000 },
  });
  expect(await example("DRAFT10", 4, false)).toMatchObject({ totalMinor: 120_000, promo: { reason: "telegram" } });
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
