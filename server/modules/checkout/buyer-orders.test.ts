import { beforeAll, expect, it } from "vitest";
import type { SellerTransition } from "../../../src/shared/contracts/seller-order";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { placeFixtureOrder, proof, signIn, snapshot } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";
import { nextOrderStage } from "../seller-orders/transition";

beforeAll(setupPlatform);

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

it("§9.2 заменяет чек на проверке ровно один раз, сохраняет историю и отклоняет чужой файл и проверенную оплату", async () => {
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
  await catalogSql("UPDATE orders SET payment_status='confirmed' WHERE number=?", order);
  const denied = await replace(next, 1);
  expect(denied.status).toBe(409);
  expect(await denied.json()).toMatchObject({
    error: { code: "VERSION_CONFLICT", details: { canReplaceProof: false } },
  });
  expect(await catalogSql("SELECT status FROM media WHERE id=?", next)).toEqual([{ status: "temp" }]);
  expect(await catalogSql("SELECT media_id FROM order_receipt_history WHERE order_number=?", order)).toEqual([
    { media_id: previous },
  ]);
});

it("§9.1 оформленный и принятый заказы активны, выполненный и отменённый в завершённых", async () => {
  const owner = await signIn(snapshot.phone ?? "");
  const order = async (stage: string) => {
    const [row] = await catalogSql(
      "INSERT INTO orders(customer,created_at,status,payment_status,snapshot) VALUES(?,?,?,'unpaid',?) RETURNING number",
      owner.subject,
      Date.now(),
      stage,
      JSON.stringify(snapshot),
    );
    return row.number;
  };
  const placed = await order("placed");
  const accepted = await order("accepted");
  const completed = await order("completed");
  const cancelled = await order("cancelled");
  const read = async (tab: string) =>
    (await getAuth(`/api/orders?shop=lavka&tab=${tab}`, { Cookie: owner.Cookie })).json();
  expect(await read("active")).toMatchObject({
    orders: [
      { number: accepted, stage: "accepted" },
      { number: placed, stage: "placed" },
    ],
  });
  expect(await read("completed")).toMatchObject({
    orders: [
      { number: cancelled, stage: "cancelled" },
      { number: completed, stage: "completed" },
    ],
  });
});

it("§9.1 и §9.2: откат после выдачи сохраняет факт выдачи и автора; отмена требует выбора товара", async () => {
  const owner = await signIn(snapshot.phone ?? "");
  const seller = await sellerFixture("korzina-demo-lavka");
  const order = await placeFixtureOrder(owner.subject, await proof(owner.subject, "attached"));
  const step = (body: SellerTransition, key = crypto.randomUUID()) =>
    postAuth(`/api/seller/orders/${order}/transition?store=lavka`, body, {
      ...seller.headers,
      "Idempotency-Key": key,
    });
  expect((await step({ action: "accept", expectedRevision: 0 })).status).toBe(200);
  expect((await step({ action: "markReady", expectedRevision: 1 })).status).toBe(400);
  expect((await step({ action: "markReady", expectedRevision: 1, confirmIncomplete: true })).status).toBe(200);
  expect((await step({ action: "handOver", expectedRevision: 2 })).status).toBe(409);
  expect((await step({ action: "markPickedUp", expectedRevision: 2, payment: { method: "debt" } })).status).toBe(200);
  const reverted = await step({ action: "rollback", expectedRevision: 3, reason: "Проверка выдачи" });
  expect(await reverted.json()).toMatchObject({
    stage: "ready",
    handedOff: true,
    paymentStatus: "pending_review",
    events: [
      { actor: seller.accountId, reason: "Проверка выдачи", createdAt: expect.any(Number) },
      ...Array.from({ length: 3 }, () => expect.any(Object)),
    ],
  });
  const buyer = await getAuth(`/api/orders/${order}?shop=lavka`, { Cookie: owner.Cookie });
  expect(await buyer.json()).toMatchObject({ canCancel: false, version: 4 });
  const cancel = { action: "cancel", expectedRevision: 4, reason: "Покупатель отказался" } as const;
  expect((await step(cancel)).status).toBe(400);
  const key = crypto.randomUUID();
  const result = await step({ ...cancel, returnStock: false }, key);
  expect(result.status).toBe(200);
  expect(await (await step({ ...cancel, returnStock: false }, key)).json()).toEqual(await result.json());
  expect(await catalogSql("SELECT COUNT(*) AS count FROM buyer_order_events WHERE order_number=?", order)).toEqual([
    { count: 5 },
  ]);
  expect(await catalogSql("SELECT stage FROM seller_order_index WHERE number=?", order)).toEqual([
    { stage: "cancelled" },
  ]);
});

it("§4.3: одновременное принятие заказа даёт один переход и конфликт, чужой магазин закрыт", async () => {
  const owner = await signIn(snapshot.phone ?? "");
  const order = await placeFixtureOrder(owner.subject, await proof(owner.subject, "attached"));
  const [first, second, stranger] = await Promise.all([
    sellerFixture("korzina-demo-lavka"),
    sellerFixture("korzina-demo-lavka"),
    sellerFixture("korzina-demo-test2"),
  ]);
  const write = (headers: HeadersInit) =>
    postAuth(`/api/seller/orders/${order}/transition?store=lavka`, { expectedRevision: 0, action: "accept" }, headers);
  expect((await write(stranger.headers)).status).toBe(403);
  const results = await Promise.all([write(first.headers), write(second.headers)]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(await catalogSql("SELECT version FROM orders WHERE number=?", order)).toEqual([{ version: 1 }]);
});

it("§9.0 и §9.1: переходы доставки и самовывоза используют существующие этапы B11", () => {
  const stages = ["placed", "accepted", "ready", "handed", "completed", "cancelled"] as const;
  const actions = ["accept", "markReady", "handOver", "markPickedUp", "complete", "rollback", "cancel"] as const;
  const common: Record<string, string> = {
    "placed/accept": "accepted",
    "accepted/markReady": "ready",
    "accepted/rollback": "placed",
    "ready/rollback": "accepted",
  };
  const branches: Record<"delivery" | "pickup", Record<string, string>> = {
    delivery: {
      "ready/handOver": "handed",
      "handed/complete": "completed",
      "handed/rollback": "ready",
      "completed/rollback": "handed",
    },
    pickup: { "ready/markPickedUp": "completed", "completed/rollback": "ready" },
  };
  for (const method of ["delivery", "pickup"] as const) {
    for (const stage of stages) {
      for (const action of actions) {
        const key = `${stage}/${action}`;
        const result =
          action === "cancel" && stage !== "cancelled" ? "cancelled" : (common[key] ?? branches[method][key]);
        if (result) expect(nextOrderStage(stage, method, action)).toBe(result);
        else expect(() => nextOrderStage(stage, method, action)).toThrow("Действие больше недоступно");
      }
    }
  }
});
