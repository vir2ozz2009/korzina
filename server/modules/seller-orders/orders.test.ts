import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import type { SellerOrder, SellerOrderCommand, SellerOrderPage } from "../../../src/shared/contracts/seller-order";
import { assertSqlBudget, type SqlMetrics } from "../../metrics";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { placeFixtureOrder, proof, signIn, snapshot } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, catalogStub } from "../catalog/testing";
import { mediaPrefix } from "../media/objects";

const shop = "korzina-demo-lavka";
beforeAll(setupPlatform);

async function fixture() {
  const buyer = await signIn(snapshot.phone ?? "");
  const seller = await sellerFixture(shop);
  const receipt = await proof(buyer.subject, "attached");
  const number = await placeFixtureOrder(buyer.subject, receipt);
  const path = `/api/seller/orders/${number}`;
  const call = (
    input: Omit<SellerOrderCommand, "expectedRevision"> & Record<string, unknown>,
    revision: number,
    key = crypto.randomUUID(),
  ) =>
    postAuth(
      `${path}/transition?store=lavka`,
      { ...input, expectedRevision: revision },
      { ...seller.headers, "Idempotency-Key": key },
    );
  return { buyer, seller, number, receipt, path, call };
}

it("§9.2, §11.4, §12.4: сборка, выдача в долг и повтор, доплата снимает долг у обеих ролей", async () => {
  const { buyer, seller, number, call } = await fixture();
  expect((await call({ action: "accept" }, 0)).status).toBe(200);
  expect((await call({ action: "setAllPacked", packed: true }, 1)).status).toBe(200);
  expect((await call({ action: "markReady" }, 2)).status).toBe(200);
  expect((await call({ action: "markPickedUp" }, 3)).status).toBe(400);
  const input = { action: "markPickedUp", payment: { method: "debt" } } as const;
  const key = crypto.randomUUID();
  const handoff = await (await call(input, 3, key)).json<SellerOrder>();
  expect(handoff).toMatchObject({ stage: "completed", revision: 4, balance: { debtMinor: 49000 } });
  expect(await (await call(input, 3, key)).json()).toEqual(handoff);
  const debt = () => getAuth("/api/seller/orders?store=lavka&tab=completed&debt=1", seller.headers);
  expect(await (await debt()).json()).toMatchObject({ orders: [{ number, debtMinor: 49000 }] });
  const active = () => getAuth("/api/orders/active?shop=lavka", { Cookie: buyer.Cookie });
  expect(await (await active()).json()).toMatchObject({ data: { orders: [{ number, debtMinor: 49000 }] } });
  const result = await call({ action: "recordPayment", method: "cash", amountMinor: 49000 }, 4);
  expect(await result.json()).toMatchObject({
    stage: "completed",
    paymentStatus: "confirmed",
    balance: { debtMinor: 0 },
  });
  expect(await (await active()).json()).toMatchObject({ data: { orders: [] } });
  expect(await (await debt()).json()).toMatchObject({ orders: [] });
});

it("§9.3, §10.6: документ чека закрыт по праву, исправление сохраняет автора, время и прежнее поступление", async () => {
  const { seller, receipt, path, number, call } = await fixture();
  const document = "%PDF-1.7\nTest receipt";
  await env.MEDIA.put(`${mediaPrefix(shop, receipt)}original.pdf`, document);
  const file = `${path}/receipts/${receipt}?store=lavka`;
  const employee = await sellerFixture(shop, "employee");
  expect((await getAuth(file, employee.headers)).status).toBe(403);
  const authorized = await getAuth(file, seller.headers);
  expect(authorized.headers.get("Content-Type")).toBe("application/pdf");
  expect(new TextDecoder().decode(await authorized.arrayBuffer())).toBe(document);
  expect(
    (await getAuth(`/api/seller/orders/${number + 1}/receipts/${receipt}?store=lavka`, seller.headers)).status,
  ).toBe(404);
  const confirmed = await call({ action: "confirmTransfer", proof: receipt, amountMinor: 60000 }, 0);
  expect(await confirmed.json()).toMatchObject({ balance: { refundMinor: 11000 }, paymentStatus: "confirmed" });
  const started = Date.now();
  const corrected = await (
    await call({ action: "correctPayment", method: "cash", amountMinor: 40000 }, 1)
  ).json<SellerOrder>();
  expect(corrected.balance).toMatchObject({ refundMinor: 0, debtMinor: 9000 });
  const saved = corrected.events[0];
  expect(saved).toMatchObject({ event: "order.correctPayment", actor: seller.accountId });
  expect(saved.createdAt).toBeGreaterThanOrEqual(started);
  expect(JSON.parse(saved.details ?? "{}")).toEqual({
    previous: { method: "transfer", amountMinor: 60000 },
    current: { method: "cash", amountMinor: 40000 },
  });
});

it("§10.10, D05: покупатель в «Оформлен» отменяет оплаченный заказ и видит сумму возврата", async () => {
  const { number, buyer, seller, path, call } = await fixture();
  expect((await call({ action: "recordPayment", method: "transfer", amountMinor: 38000 }, 0)).status).toBe(200);
  const cancel = await postAuth(
    `/api/orders/${number}/cancel?shop=lavka`,
    { expectedVersion: 1 },
    { Cookie: buyer.Cookie },
  );
  expect(await cancel.json()).toMatchObject({ stage: "cancelled", refundMinor: 38000 });
  expect(await (await getAuth(`${path}?store=lavka`, seller.headers)).json()).toMatchObject({
    stage: "cancelled",
    balance: { refundMinor: 38000, debtMinor: 0 },
  });
});

it("§9.5, §9.7, §12: счётчики всего магазина и фильтра по номеру, ревизия без чтения строк", async () => {
  const { seller, number } = await fixture();
  const { number: other, call } = await fixture();
  expect((await call({ action: "accept" }, 0)).status).toBe(200);
  const list = (query = "") => getAuth(`/api/seller/orders?store=lavka${query}`, seller.headers);
  const all = await (await list()).json<SellerOrderPage>();
  const selected = await (await list(`&search=%E2%84%96${other}`)).json<SellerOrderPage>();
  expect(selected).toMatchObject({
    active: all.active,
    newlyPlaced: all.newlyPlaced,
    counts: { accepted: 1 },
    orders: [{ number: other, stage: "accepted" }],
  });
  expect(all.orders.find((entry) => entry.number === number)?.stage).toBe("placed");
  expect(await (await list(`&rev=${all.rev}`)).json()).toEqual({ rev: all.rev, unchanged: true });
  const metadata = { id: shop, slug: "lavka", name: "Тест", status: "active", plan: "base", createdAt: 0 };
  const direct = (path: string) =>
    catalogStub().fetch(
      new Request(`https://demo.korzina.app/api/seller/orders${path}`, {
        headers: { ...seller.headers, "x-korzina-shop": encodeURIComponent(JSON.stringify(metadata)) },
      }),
    );
  for (const [path, limit] of [
    [`?rev=${all.rev}`, 1],
    [`/${other}`, 4],
  ] as const) {
    const response = await direct(path);
    expect(response.ok).toBe(true);
    const metrics: SqlMetrics = JSON.parse(response.headers.get("x-korzina-sql") ?? "null");
    assertSqlBudget(metrics, { sql: limit });
  }
  const index = await catalogSql("SELECT stage,revision FROM seller_order_index WHERE number=?", other);
  expect(index).toEqual([{ stage: "accepted", revision: 1 }]);
});
