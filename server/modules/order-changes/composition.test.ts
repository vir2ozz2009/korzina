import { runInDurableObject } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import type { BuyerOrder } from "../../../src/shared/contracts/buyer-order";
import type { CompositionEdits, CompositionQuote, OrderLine } from "../../../src/shared/contracts/order-changes";
import type { SellerOrder } from "../../../src/shared/contracts/seller-order";
import { assertSqlBudget, type SqlMetrics } from "../../metrics";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { signIn, snapshot } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, catalogStub, shopRequest } from "../catalog/testing";
import { expireCompositionChanges } from "./deadline";

const shop = "korzina-demo-lavka";
const original = (variantId: string, productId: string, name: string, totalMinor: number): OrderLine => ({
  variantId,
  productId,
  name,
  unit: "1 шт",
  quantity: 1,
  priceMinor: totalMinor,
  totalMinor,
});
const tomatoes = original("sku-01", "product-01", "Томаты", 120_000);
const cheese = original("sku-02", "product-02", "Сыр", 50_000);
const other = original("sku-03", "product-03", "Хлеб", 180_000);
const edits: CompositionEdits["edits"] = [
  { kind: "unavailable", lineId: "sku-01", quantity: 0 },
  { kind: "replace", lineId: "sku-02", variantId: "sku-07", quantity: 4 },
];

beforeAll(setupPlatform);

async function fixture(lines = [tomatoes, cheese, other], stage = "accepted") {
  const buyer = await signIn(snapshot.phone ?? "");
  const seller = await sellerFixture(shop);
  const totalMinor = lines.reduce((total, line) => total + line.totalMinor, 0);
  await catalogSql("UPDATE products SET sale_pause=NULL,published=1,visible=1");
  await catalogSql("UPDATE variants SET visible=1,sale_pause=NULL,stock=10,price_minor=100000 WHERE id='sku-07'");
  const [{ number }] = await catalogSql(
    "INSERT INTO orders(customer,created_at,status,payment_status,snapshot) VALUES(?,?,?,'confirmed',?) RETURNING number",
    buyer.subject,
    Date.now(),
    stage,
    JSON.stringify({ ...snapshot, lines, itemsMinor: totalMinor, totalMinor }),
  );
  const sellerPath = `/api/seller/orders/${number}`;
  const buyerPath = `/api/orders/${number}`;
  const headers = { Cookie: buyer.Cookie };
  const quote = (input: CompositionEdits) =>
    postAuth(`${sellerPath}/composition/quote?store=lavka`, input, seller.headers);
  const propose = (input: CompositionEdits, quote: string, key = crypto.randomUUID()) =>
    postAuth(
      `${sellerPath}/composition?store=lavka`,
      { ...input, quote },
      { ...seller.headers, "Idempotency-Key": key },
    );
  const buyerView = async () => (await getAuth(`${buyerPath}?shop=lavka`, headers)).json<BuyerOrder>();
  const sellerView = async () => (await getAuth(`${sellerPath}?store=lavka`, seller.headers)).json<SellerOrder>();
  const answer = (input: Record<string, unknown>, key = crypto.randomUUID()) =>
    postAuth(`${buyerPath}/composition?shop=lavka`, input, { ...headers, "Idempotency-Key": key });
  return { number, buyer, seller, quote, propose, answer, buyerView, sellerView, sellerPath };
}

it.each([
  ["accept", 580_000, 0, 230_000],
  ["decline", 180_000, 170_000, 0],
] as const)(
  "§17.1 и §17.2 · обе стороны видят фактический итог, решение %s",
  async (decision, total, refund, topUp) => {
    const order = await fixture();
    const input = { expectedVersion: 0, edits };
    const preview = await (await order.quote(input)).json<CompositionQuote>();
    expect(preview.totals).toMatchObject({ originalMinor: 350_000, currentMinor: 580_000, topUpMinor: 230_000 });
    expect(preview.lines[1]).toMatchObject({
      before: { totalMinor: 50_000 },
      after: { quantity: 4, totalMinor: 400_000 },
      deltaMinor: 350_000,
    });
    const key = crypto.randomUUID();
    const proposed = await order.propose(input, preview.quote, key);
    expect(proposed.status).toBe(200);
    expect(await (await order.propose(input, preview.quote, key)).json()).toEqual(await proposed.json());
    const [buyer, seller] = await Promise.all([order.buyerView(), order.sellerView()]);
    expect(buyer.composition).toEqual(seller.composition);
    expect(buyer).toMatchObject({
      totalMinor: 230_000,
      refundMinor: 120_000,
      composition: {
        totals: { originalMinor: 350_000, currentMinor: 230_000 },
        lines: [{ status: "applied" }, { status: "pending" }],
      },
    });
    expect(await catalogSql("SELECT sale_pause FROM products WHERE id='product-01'")).toEqual([
      { sale_pause: expect.any(Number) },
    ]);
    const answerKey = crypto.randomUUID();
    const response = { expectedVersion: buyer.version, changeId: buyer.composition?.id, lineId: "sku-02", decision };
    const done = await order.answer(response, answerKey);
    expect(done.status).toBe(200);
    expect(await (await order.answer(response, answerKey)).json()).toEqual(await done.json());
    const [updatedBuyer, updatedSeller] = await Promise.all([order.buyerView(), order.sellerView()]);
    expect(updatedBuyer.composition).toEqual(updatedSeller.composition);
    expect(updatedBuyer.composition?.totals).toMatchObject({
      originalMinor: 350_000,
      currentMinor: total,
      refundMinor: refund,
      topUpMinor: topUp,
    });
    expect(await catalogSql("SELECT stock FROM variants WHERE id='sku-07'")).toEqual([
      { stock: decision === "accept" ? 6 : 10 },
    ]);
    expect(
      await catalogSql("SELECT event FROM buyer_order_events WHERE order_number=? ORDER BY id", order.number),
    ).toEqual([{ event: "composition.proposed" }, { event: "composition.answered" }]);
  },
);

it("§9.3 и §11.3 · срок удаляет последнюю отсутствующую позицию и открывает полный возврат один раз", async () => {
  const order = await fixture([cheese]);
  const input = { expectedVersion: 0, edits: [edits[1]] };
  const preview = await (await order.quote(input)).json<CompositionQuote>();
  expect((await order.propose(input, preview.quote)).status).toBe(200);
  const expires = (await order.buyerView()).composition?.expiresAt ?? 0;
  const due = await runInDurableObject(catalogStub(), (_object, ctx) => ctx.storage.getAlarm());
  expect(due).toBeLessThanOrEqual(expires);
  const expired = await runInDurableObject(catalogStub(), (_object, ctx) => {
    const notified: number[] = [];
    expireCompositionChanges(ctx.storage, expires, (number) => notified.push(number));
    expireCompositionChanges(ctx.storage, expires, (number) => notified.push(number));
    return notified;
  });
  expect(expired).toEqual([order.number]);
  expect(await order.buyerView()).toMatchObject({ stage: "cancelled", refundMinor: 50_000, lines: [] });
});

it("§14.3, §15.2 и §11.4 · передачу останавливает открытая замена, чужой заказ закрыт, бюджеты карточек прежние", async () => {
  const order = await fixture([cheese, other], "ready");
  const input = { expectedVersion: 0, edits: [edits[1]] };
  const preview = await (await order.quote(input)).json<CompositionQuote>();
  expect((await order.propose(input, preview.quote)).status).toBe(200);
  const delivery = await postAuth(
    `${order.sellerPath}/transition?store=lavka`,
    { action: "markPickedUp", expectedRevision: 1 },
    order.seller.headers,
  );
  expect(await delivery.json()).toMatchObject({ error: { code: "ANOTHER_CHANGE_PENDING" } });
  const stranger = await signIn("+84902345678");
  const changeId = (await order.buyerView()).composition?.id;
  const denied = await postAuth(
    `/api/orders/${order.number}/composition?shop=lavka`,
    { expectedVersion: 1, changeId, lineId: "sku-02", decision: "accept" },
    { Cookie: stranger.Cookie },
  );
  expect(denied.status).toBe(404);
  for (const [path, headers, sql] of [
    [`orders/${order.number}`, { Cookie: order.buyer.Cookie }, 3],
    [`seller/orders/${order.number}`, order.seller.headers, 4],
  ] as const) {
    const response = await shopRequest(path, headers);
    expect(response.status).toBe(200);
    assertSqlBudget(JSON.parse(response.headers.get("x-korzina-sql") ?? "{}") as SqlMetrics, { sql });
    await response.arrayBuffer();
  }
});
