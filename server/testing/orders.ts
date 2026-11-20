import { expect } from "vitest";
import type { OrderSnapshot } from "../../src/shared/contracts/checkout";
import { catalogSql } from "../modules/catalog/testing";
import { cookieFrom, getAuth, postAuth } from "./auth";

export const snapshot: OrderSnapshot = {
  revision: 0,
  currency: "VND",
  lines: [
    {
      variantId: "sku-01",
      productId: "product-01",
      name: "Томаты",
      unit: "500 г",
      quantity: 1,
      priceMinor: 49000,
      totalMinor: 49000,
    },
  ],
  itemsMinor: 49000,
  deliveryMinor: 0,
  totalMinor: 49000,
  receiving: { mode: "pickup" },
  fulfillment: { mode: "pickup", available: true, pickup: { address: "45 Lê Lợi", hours: "09:00–20:00" } },
  time: null,
  phone: "+84912345678",
  telegramLinked: false,
  payment: "transfer",
  paymentStatus: "pending_review",
};

export async function signIn(phone: string, shop = "lavka") {
  const response = await postAuth(`/api/auth/contact?shop=${shop}`, { phone, confirmed: true });
  expect(response.status).toBe(200);
  const cookie = cookieFrom(response);
  const { subject } = await (await getAuth(`/api/auth/session?shop=${shop}`, { Cookie: cookie })).json<{
    subject: string;
  }>();
  return { Cookie: cookie, subject };
}

export async function proof(owner: string, status: "temp" | "attached" = "temp") {
  const id = crypto.randomUUID();
  await catalogSql(
    `INSERT INTO media(id,owner,purpose,status,ready,bytes,mime,request_key,fingerprint,created_at,expires_at)
     VALUES(?,?,'receipt',?,1,24,'application/pdf',?,'pdf',?,?)`,
    id,
    owner,
    status,
    id,
    Date.now(),
    status === "temp" ? Date.now() + 60_000 : null,
  );
  return id;
}

export async function placeFixtureOrder(owner: string, mediaId: string) {
  const [row] = await catalogSql(
    "INSERT INTO orders(customer,created_at,status,payment_status,proof_media_id,snapshot) VALUES(?,?,'placed','pending_review',?,?) RETURNING number",
    owner,
    Date.now(),
    mediaId,
    JSON.stringify(snapshot),
  );
  return Number(row.number);
}
