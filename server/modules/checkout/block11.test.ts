import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import type { BuyerOrder } from "../../../src/shared/contracts/buyer-order";
import type { SellerOrder } from "../../../src/shared/contracts/seller-order";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { placeFixtureOrder, proof, signIn, snapshot } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";
import { mediaPrefix } from "../media/objects";

const shop = "korzina-demo-lavka";
beforeAll(setupPlatform);

async function fixture() {
  const { subject, Cookie } = await signIn(snapshot.phone ?? "");
  const buyer = { Cookie };
  const seller = (await sellerFixture(shop)).headers;
  const originalProof = await proof(subject, "attached");
  const number = await placeFixtureOrder(subject, originalProof);
  const order = `/api/orders/${number}`;
  const sellerOrder = `/api/seller/orders/${number}`;
  const action = (data: object, key = crypto.randomUUID(), headers = seller) =>
    postAuth(`${sellerOrder}/transition?store=lavka`, data, { ...headers, "Idempotency-Key": key });
  const customer = (path: string, data: object, key = crypto.randomUUID()) =>
    postAuth(`${order}${path}?shop=lavka`, data, { ...buyer, "Idempotency-Key": key });
  const details = () => getAuth(`${order}?shop=lavka`, buyer).then((result) => result.json<BuyerOrder>());
  return { buyer, seller, subject, number, action, customer, details, order, sellerOrder, originalProof };
}

it("T05, §13.2 · отдельный чек доплаты не меняет исходную оплату, подтверждается только последняя версия", async () => {
  const f = await fixture();
  const receiving = { mode: "delivery", address: "Учебная доставка" };
  const fulfillment = { mode: "delivery", available: true, tariff: "after_order", feeMinor: null, payee: "shop" };
  await catalogSql(
    "UPDATE orders SET snapshot=json_set(snapshot,'$.receiving',json(?),'$.fulfillment',json(?)) WHERE number=?",
    JSON.stringify(receiving),
    JSON.stringify(fulfillment),
    f.number,
  );
  expect(
    (
      await f.action({
        action: "recordPayment",
        method: "transfer",
        amountMinor: snapshot.totalMinor,
        expectedRevision: 0,
      })
    ).status,
  ).toBe(200);
  expect((await f.action({ action: "setDeliveryFee", amountMinor: 69, expectedRevision: 1 })).status).toBe(200);
  const { topUp } = await f.details();
  expect(topUp?.id).toBeTruthy();
  const first = await proof(f.subject, "temp");
  const second = await proof(f.subject, "temp");
  const submitted = { expectedVersion: 2, obligationId: topUp?.id, proofMediaId: first };
  const once = crypto.randomUUID();
  expect((await f.customer("/proof", submitted, once)).status).toBe(200);
  expect((await f.customer("/proof", submitted, once)).status).toBe(200);
  expect((await f.customer("/proof", { ...submitted, expectedVersion: 3, proofMediaId: second })).status).toBe(200);
  expect(await f.details()).toMatchObject({
    paymentStatus: "confirmed",
    debtMinor: 69,
    topUp: { proof: second, status: "pending_review" },
  });
  const order = await getAuth(`${f.sellerOrder}?store=lavka`, f.seller).then((result) => result.json<SellerOrder>());
  expect(order.receipts.map((item) => item.id)).toEqual([second, expect.any(String), expect.any(String)]);
  expect(order.receipts.map((item) => item.id)).toEqual(expect.arrayContaining([f.originalProof, first]));
  const review = { action: "confirmTransfer", expectedRevision: 4, amountMinor: 69, obligationId: topUp?.id };
  expect((await f.action({ ...review, proof: first })).status).toBe(409);
  const key = crypto.randomUUID();
  const confirmed = await f.action({ ...review, proof: second }, key);
  expect(confirmed.status).toBe(200);
  expect((await f.action({ ...review, proof: second }, key)).status).toBe(200);
  expect(await f.details()).toMatchObject({ paymentStatus: "confirmed", version: 5 });
  expect((await f.details()).debtMinor).toBeUndefined();
  expect(await catalogSql("SELECT proof_media_id FROM orders WHERE number=?", f.number)).toEqual([
    { proof_media_id: f.originalProof },
  ]);
});

it("§10.3–§10.4, T05 · возврат в пределах резерва, QR только по заказу, частичная выплата и повтор", async () => {
  const f = await fixture();
  expect(
    (
      await f.action({
        action: "recordPayment",
        method: "transfer",
        amountMinor: snapshot.totalMinor,
        expectedRevision: 0,
      })
    ).status,
  ).toBe(200);
  await catalogSql("UPDATE orders SET status='completed' WHERE number=?", f.number);
  const open = { action: "openRefund", expectedRevision: 1, amountMinor: 60 };
  expect((await f.action({ ...open, amountMinor: snapshot.totalMinor + 1 })).status).toBe(400);
  const denied = (await sellerFixture(shop, "employee", ["orders"])).headers;
  expect((await f.action(open, crypto.randomUUID(), denied)).status).toBe(403);
  const race = await Promise.all([f.action(open), f.action(open)]);
  expect(race.map((result) => result.status).sort()).toEqual([200, 409]);
  const { refund } = await f.details();
  expect(refund).toMatchObject({ amountMinor: 60 });
  const qr = crypto.randomUUID();
  await catalogSql(
    `INSERT INTO media(id,owner,purpose,status,ready,bytes,mime,request_key,fingerprint,created_at,expires_at)
     VALUES(?,?,'refund','temp',1,8,'image/webp',?,'qr',?,?)`,
    qr,
    f.subject,
    qr,
    Date.now(),
    Date.now() + 60_000,
  );
  await env.MEDIA.put(`${mediaPrefix(shop, qr)}original.webp`, "test-img");
  const details = { expectedVersion: 2, refundId: refund?.id, mediaId: qr };
  const key = crypto.randomUUID();
  expect((await f.customer("/refund", details, key)).status).toBe(200);
  expect((await f.customer("/refund", details, key)).status).toBe(200);
  expect((await f.details()).refund?.details?.mediaId).toBe(qr);
  expect((await getAuth(`${f.order}/refund/${qr}?shop=lavka`, f.buyer)).status).toBe(200);
  expect((await getAuth(`${f.sellerOrder}/refund/${qr}?store=lavka`, denied)).status).toBe(403);
  expect((await getAuth(`${f.sellerOrder}/refund/${qr}?store=lavka`, f.seller)).status).toBe(200);
  expect((await getAuth(`/api/media/${qr}/link?shop=lavka`, f.buyer)).status).toBe(404);
  const returned = {
    action: "markRefundReturned",
    expectedRevision: 3,
    refundId: refund?.id,
    amountMinor: 20,
    comment: "Учебная выплата",
  };
  expect((await f.action(returned)).status).toBe(200);
  expect(await f.details()).toMatchObject({ stage: "completed", refund: { amountMinor: 40 }, returnedMinor: 20 });
  expect((await f.action({ ...returned, amountMinor: 41, expectedRevision: 4 })).status).toBe(400);
  expect((await f.action({ ...returned, amountMinor: 40, expectedRevision: 4 })).status).toBe(200);
  expect(await f.details()).toMatchObject({ stage: "completed", returnedMinor: 60 });
  expect((await f.details()).refund).toBeUndefined();
  expect((await getAuth(`${f.order}/refund/${qr}?shop=lavka`, f.buyer)).status).toBe(404);
  expect(
    await catalogSql(
      "SELECT amount_minor FROM seller_money_operations WHERE number=? AND kind='returned' ORDER BY id",
      f.number,
    ),
  ).toEqual([{ amount_minor: 20 }, { amount_minor: 40 }]);
});
