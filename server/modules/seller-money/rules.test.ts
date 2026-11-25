import { env } from "cloudflare:workers";
import { beforeAll, expect, it, vi } from "vitest";
import type { SellerMoneyOperation, SellerMoneyPage } from "../../../src/shared/contracts/seller-money";
import { assertSqlBudget } from "../../metrics";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { placeFixtureOrder, proof } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, shopRequest } from "../catalog/testing";

const id = "korzina-demo-lavka";
const endpoint = "/api/seller/money";
beforeAll(setupPlatform);

it("§10.1 · исправление поступления сохраняет день и историю, повтор команды не создаёт операцию", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-24T16:59:59Z"), toFake: ["Date"] });
  try {
    const { headers, accountId } = await sellerFixture(id);
    const number = await placeFixtureOrder("guest:money", await proof("guest:money", "attached"));
    const transition = (data: object, key?: string) =>
      postAuth(
        `/api/seller/orders/${number}/transition?store=lavka`,
        data,
        key ? { ...headers, "Idempotency-Key": key } : headers,
      );
    expect(
      (await transition({ action: "recordPayment", expectedRevision: 0, amountMinor: 300, method: "transfer" })).status,
    ).toBe(200);
    vi.setSystemTime(new Date("2026-11-24T17:00:00Z"));
    const key = crypto.randomUUID();
    const correction = { action: "correctPayment", expectedRevision: 1, amountMinor: 250, method: "cash" };
    for (let replay = 0; replay < 2; replay++) {
      const result = await transition(correction, key);
      expect(result.status).toBe(200);
      const saved = await result.json<{ revision: number; events: unknown[] }>();
      expect(saved.revision).toBe(2);
      expect(saved.events).toHaveLength(2);
      expect(saved.events[0]).toMatchObject({
        actor: accountId,
        createdAt: Date.now(),
        event: "order.correctPayment",
        details: JSON.stringify({
          previous: { method: "transfer", amountMinor: 300 },
          current: { method: "cash", amountMinor: 250 },
        }),
      });
    }
    const today = await shopRequest("seller/money", headers);
    expect(today.status).toBe(200);
    expect(await today.json()).toMatchObject({ period: { from: "2026-11-25", to: "2026-11-25" }, receivedMinor: 0 });
    const yesterday = await getAuth(`${endpoint}?store=lavka&from=2026-11-24&to=2026-11-24`, headers);
    expect(await yesterday.json()).toMatchObject({
      receivedMinor: 250,
      methods: [{ method: "cash", amountMinor: 250 }],
    });
    const page = await getAuth(`${endpoint}/operations?store=lavka&from=2026-11-24&to=2026-11-24`, headers);
    expect(await page.json()).toMatchObject({ rows: [{ number, amountMinor: 250, method: "cash" }] });
    const revision = (
      await catalogSql("SELECT CAST(value AS INTEGER) AS revision FROM settings WHERE key='seller_orders_revision'")
    )[0]?.revision;
    const unchanged = await shopRequest(`seller/money?from=2026-11-24&to=2026-11-24&rev=${revision}`, headers);
    assertSqlBudget(JSON.parse(unchanged.headers.get("x-korzina-sql") ?? "null"), {
      sql: 2,
      rowsRead: 8,
      rowsWritten: 0,
    });
    expect(await unchanged.json()).toMatchObject({ revision, unchanged: true });
  } finally {
    vi.useRealTimers();
  }
});

it("§10.2, §10.5 и §13.3 · суммы неполной истории, догрузка 10/10/2 и поиск по всей выборке", async () => {
  const { headers } = await sellerFixture(id);
  const owner = "guest:money-pagination";
  const number = await placeFixtureOrder(owner, await proof(owner, "attached"));
  const time = Date.parse("2026-11-22T08:00:00Z");
  const ids = await catalogSql(
    `WITH RECURSIVE synthetic(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM synthetic WHERE i<22)
     INSERT INTO buyer_order_events(order_number,actor,event,created_at)
     SELECT ?,'fixture','order.recordPayment',? FROM synthetic RETURNING id`,
    number,
    time,
  );
  for (const [index, row] of ids.entries())
    await catalogSql(
      "INSERT INTO seller_money_operations VALUES(?,?,?,'VND','received',?,?)",
      Number(row.id),
      number,
      time,
      index === 21 ? null : index === 0 || index === 20 ? 250 : 300,
      index === 1 ? null : "transfer",
    );
  const query = "store=lavka&from=2026-11-22&to=2026-11-22";
  const overview = await getAuth(`${endpoint}?${query}`, headers);
  expect(await overview.json()).toMatchObject({ receivedMinor: 6200, receivedIncomplete: true, returnedMinor: 0 });
  const page = async (extra = "") => {
    const res = await getAuth(`${endpoint}/operations?${query}${extra}`, headers);
    expect(res.status).toBe(200);
    return res.json<SellerMoneyPage<SellerMoneyOperation>>();
  };
  const a = await page();
  const b = await page(`&cursor=${encodeURIComponent(a.cursor ?? "")}`);
  const c = await page(`&cursor=${encodeURIComponent(b.cursor ?? "")}`);
  expect([a.rows.length, b.rows.length, c.rows.length, c.cursor]).toEqual([10, 10, 2, undefined]);
  expect(new Set([...a.rows, ...b.rows, ...c.rows].map((row) => row.id)).size).toBe(22);
  expect((await page("&method=transfer&search=250")).rows.map((row) => row.amountMinor)).toEqual([250, 250]);
  expect((await page("&method=unknown")).rows.map((row) => row.amountMinor)).toEqual([300]);
});

it("право на денежные задачи и журнал проверяется при каждом чтении и не переносится между магазинами", async () => {
  const denied = await sellerFixture(id, "employee", ["orders"]);
  const allowed = await sellerFixture(id, "employee", ["orders", "payments"]);
  for (const path of ["", "/operations", "/tasks"]) {
    const suffix = `${path}?group=review&store=`;
    expect((await getAuth(`${endpoint}${suffix}lavka`, denied.headers)).status).toBe(403);
    expect((await getAuth(`${endpoint}${suffix}test2`, allowed.headers)).status).toBe(403);
    expect((await getAuth(`${endpoint}${suffix}lavka`, allowed.headers)).status).toBe(200);
  }
  await env.PLATFORM.prepare("UPDATE memberships SET permissions='[\"orders\"]' WHERE account_id=?")
    .bind(allowed.accountId)
    .run();
  expect((await getAuth(`${endpoint}?store=lavka&rev=1`, allowed.headers)).status).toBe(403);
  expect((await getAuth(`${endpoint}/operations?store=lavka`, allowed.headers)).status).toBe(403);
  const orders = await getAuth("/api/seller/orders?store=lavka", allowed.headers);
  expect(orders.status).toBe(200);
  expect(await orders.json()).toMatchObject({ money: false });
});
