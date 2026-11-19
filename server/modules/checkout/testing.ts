import { expect } from "vitest";
import type { QuoteResponse } from "../../../src/shared/contracts/checkout";
import { cookieFrom, postAuth } from "../../testing/auth";
import { catalogSql } from "../catalog/testing";

export async function setupCheckout() {
  await catalogSql("UPDATE catalog_state SET currency='VND' WHERE id=1");
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='fulfillment'",
    JSON.stringify({
      delivery: {
        mode: "map",
        zones: [
          {
            id: "center",
            geometry: { type: "radius", center: { lat: 10.7769, lon: 106.7009 }, radiusMeters: 6000 },
            tariff: { kind: "fixed", feeMinor: 25000 },
          },
        ],
      },
      pickup: { address: "45 Lê Lợi", hours: "09:00–20:00" },
    }),
  );
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='receiving_schedule'",
    JSON.stringify({
      timeZone: "Asia/Ho_Chi_Minh",
      delivery: { mode: "after_order", days: {} },
      pickup: { mode: "after_order", days: {} },
    }),
  );
  await catalogSql(
    "UPDATE settings SET value=? WHERE key='purchase_payment'",
    JSON.stringify({
      minimumMinor: 0,
      methods: ["cash", "transfer"],
      instruction: "Инструкция тестового магазина",
    }),
  );
}

export const buy = (path: string, body: object, Cookie: string, key: string = crypto.randomUUID()) =>
  postAuth(`/api/${path}?shop=lavka`, body, { Cookie, "Idempotency-Key": key });
export const getQuote = async (cookie: string) => {
  const response = await buy("quote", {}, cookie);
  expect(response.status).toBe(200);
  return response.json<QuoteResponse>();
};
export async function customer(variantId: string, receiving = { mode: "pickup" } as object) {
  const contact = await postAuth("/api/auth/contact?shop=lavka", { phone: "+84912345678", confirmed: true });
  const cookie = cookieFrom(contact);
  expect(contact.status).toBe(200);
  const cart = await buy("cart", { variantId, quantity: 1, expectedRevision: 0 }, cookie);
  expect(cart.status).toBe(200);
  expect((await buy("receiving", { receiving, expectedRevision: 1, complete: true }, cookie)).status).toBe(200);
  return cookie;
}
