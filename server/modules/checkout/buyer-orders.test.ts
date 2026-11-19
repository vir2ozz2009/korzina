import { beforeAll, expect, it } from "vitest";
import type { OrderSnapshot } from "../../../src/shared/contracts/checkout";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";

beforeAll(setupPlatform);

const snapshot: OrderSnapshot = {
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

async function signIn(phone: string, shop = "lavka") {
  const response = await postAuth(`/api/auth/contact?shop=${shop}`, { phone, confirmed: true });
  expect(response.status).toBe(200);
  const cookie = cookieFrom(response);
  const { subject } = await (await getAuth(`/api/auth/session?shop=${shop}`, { Cookie: cookie })).json<{
    subject: string;
  }>();
  return { Cookie: cookie, subject };
}

async function proof(owner: string, status: "temp" | "attached" = "temp") {
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

async function placeFixtureOrder(owner: string, mediaId: string) {
  const [row] = await catalogSql(
    "INSERT INTO orders(customer,created_at,status,payment_status,proof_media_id,snapshot) VALUES(?,?,'placed','pending_review',?,?) RETURNING number",
    owner,
    Date.now(),
    mediaId,
    JSON.stringify(snapshot),
  );
  return Number(row.number);
}

it("чужой заказ, другой магазин и тот же номер на другом устройстве не раскрывают заказ или чек", async () => {
  const owner = await signIn(snapshot.phone ?? "");
  const stranger = await signIn("+84902345678");
  const sameNumber = await signIn(snapshot.phone ?? "");
  const otherShop = await signIn(snapshot.phone ?? "", "test2");
  const mediaId = await proof(owner.subject, "attached");
  const order = await placeFixtureOrder(owner.subject, mediaId);

  const detail = (shop: string) => `/api/orders/${order}?shop=${shop}`;
  expect(await (await getAuth(detail("lavka"), { Cookie: owner.Cookie })).json()).toMatchObject({
    number: order,
    canReplaceProof: true,
  });
  for (const { Cookie } of [stranger, sameNumber]) {
    const response = await getAuth(detail("lavka"), { Cookie });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Заказ недоступен" } });
    expect(await (await getAuth("/api/orders?shop=lavka", { Cookie })).json()).toEqual({ orders: [] });
    const write = await postAuth(
      `/api/orders/${order}/proof?shop=lavka`,
      { expectedVersion: 0, proofMediaId: mediaId },
      { Cookie, "Idempotency-Key": crypto.randomUUID() },
    );
    expect(write.status).toBe(404);
    expect((await getAuth(`/api/media/${mediaId}/link?shop=lavka`, { Cookie })).status).toBe(403);
  }
  expect((await getAuth(detail("test2"), { Cookie: otherShop.Cookie })).status).toBe(404);
  expect((await getAuth(`/api/media/${mediaId}/link?shop=test2`, { Cookie: otherShop.Cookie })).status).toBe(404);
  const token = owner.Cookie.split("=")[1];
  expect((await getAuth(detail("test2"), { Authorization: `Bearer ${token}` })).status).toBe(401);
});

it("заменяет чек на проверке ровно один раз, сохраняет историю и отклоняет чужой файл и проверенную оплату", async () => {
  const owner = await signIn(snapshot.phone ?? "");
  const stranger = await signIn("+84902345678");
  const previous = await proof(owner.subject, "attached");
  const replacement = await proof(owner.subject);
  const foreign = await proof(stranger.subject);
  const order = await placeFixtureOrder(owner.subject, previous);
  const replace = (proofMediaId: string, expectedVersion = 0, key = crypto.randomUUID()) =>
    postAuth(
      `/api/orders/${order}/proof?shop=lavka`,
      { expectedVersion, proofMediaId },
      { Cookie: owner.Cookie, "Idempotency-Key": key },
    );

  expect((await replace(foreign)).status).toBe(400);
  const key = crypto.randomUUID();
  const accepted = await replace(replacement, 0, key);
  expect(accepted.status).toBe(200);
  const result = await accepted.json();
  expect(result).toMatchObject({ number: order, paymentStatus: "pending_review", version: 1, canReplaceProof: true });
  expect(await (await replace(replacement, 0, key)).json()).toEqual(result);
  expect(await catalogSql("SELECT media_id FROM order_receipt_history WHERE order_number=?", order)).toEqual([
    { media_id: previous },
  ]);
  expect(await catalogSql("SELECT proof_media_id FROM orders WHERE number=?", order)).toEqual([
    { proof_media_id: replacement },
  ]);
  expect(await catalogSql("SELECT status FROM media WHERE id=?", replacement)).toEqual([{ status: "attached" }]);

  const next = await proof(owner.subject);
  expect((await replace(next, 0)).status).toBe(409);
  for (const status of ["confirmed", "rejected"]) {
    await catalogSql("UPDATE orders SET payment_status=? WHERE number=?", status, order);
    const denied = await replace(next, 1);
    expect(denied.status).toBe(409);
    expect(await denied.json()).toMatchObject({
      error: { code: "VERSION_CONFLICT", details: { canReplaceProof: false } },
    });
  }
  expect(await catalogSql("SELECT status FROM media WHERE id=?", next)).toEqual([{ status: "temp" }]);
  expect(await catalogSql("SELECT media_id FROM order_receipt_history WHERE order_number=?", order)).toEqual([
    { media_id: previous },
  ]);
});
