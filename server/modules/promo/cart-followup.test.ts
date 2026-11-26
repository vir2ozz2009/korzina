import { expect, it } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import type { PromoOffer, PromoTerms } from "../../../src/shared/contracts/promo";
import { customerCookie } from "../../auth/cookies";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { prepareCustomer } from "../auth/service";
import { catalogSql, shopCatalogSql } from "../catalog/testing";
import { buy, customer } from "../checkout/testing";

import { readCart, seller, shop, terms } from "./cart-followup-fixture";

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
