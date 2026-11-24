import { env } from "cloudflare:workers";
import { beforeAll, expect, it, vi } from "vitest";
import type { OrderSnapshot } from "../../../src/shared/contracts/checkout";
import { productSales, salesRank, salesReport, salesSummary } from "../../../src/shared/contracts/seller-sales";
import { assertSqlBudget } from "../../metrics";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { snapshot } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, shopRequest } from "../catalog/testing";
import { orderRevenue } from "./revenue";

const shopId = "korzina-demo-lavka";
const headersPath = "/api/seller/statistics";
beforeAll(setupPlatform);

function orderSnapshot(itemsMinor: number, method: "pickup" | "shop" | "courier" = "pickup"): OrderSnapshot {
  const deliveryMinor = method === "shop" ? 100 : 0;
  return {
    ...snapshot,
    itemsMinor,
    deliveryMinor,
    totalMinor: itemsMinor + deliveryMinor,
    lines: [{ ...snapshot.lines[0], totalMinor: itemsMinor }],
    fulfillment:
      method === "pickup"
        ? snapshot.fulfillment
        : {
            mode: "delivery",
            available: true,
            inZone: true,
            payee: method,
            feeMinor: 100,
            tariff: "fixed",
          },
  };
}

it("§9.2, П2, П3 · выручка после скидки и адресных возвратов, без оплаты курьеру и без двойного вычета", () => {
  const order = orderSnapshot(500, "shop");
  order.lines = [
    { ...snapshot.lines[0], totalMinor: 360, quantity: 2 },
    { ...snapshot.lines[0], variantId: "sku-02", totalMinor: 240, quantity: 1 },
  ];
  expect(orderRevenue(order)).toMatchObject({
    revenueMinor: 600,
    lines: [{ revenueMinor: 300 }, { revenueMinor: 200 }],
  });
  expect(orderRevenue(order, { itemsMinor: 51, deliveryMinor: 0 })).toMatchObject({
    revenueMinor: 549,
    lines: [
      { revenueMinor: 269, quantity: 2 },
      { revenueMinor: 180, quantity: 1 },
    ],
  });
  expect(orderRevenue(order, { itemsMinor: 0, deliveryMinor: 60, variants: { "sku-02": 50 } })).toMatchObject({
    revenueMinor: 490,
    lines: [{ revenueMinor: 300 }, { revenueMinor: 150 }],
  });
  expect(orderRevenue(orderSnapshot(500, "courier")).revenueMinor).toBe(500);
});

async function fixture(stage: string, order: OrderSnapshot, completedAt?: string, finance?: object) {
  const [{ number }] = await catalogSql(
    `INSERT INTO orders(customer,created_at,status,payment_status,snapshot,fulfillment_state)
     VALUES('guest:sales',?,?,'confirmed',?,?) RETURNING number`,
    Date.parse("2026-11-10T08:00:00Z"),
    stage,
    JSON.stringify(order),
    JSON.stringify(finance ? { finance } : {}),
  );
  if (completedAt)
    await catalogSql(
      `INSERT INTO buyer_order_events(order_number,actor,event,created_at,details)
       VALUES(?,'owner','order.markPickedUp',?,'{"from":"ready","to":"completed"}')`,
      number,
      Date.parse(completedAt),
    );
  return Number(number);
}

it("§14.1, §9.1, П3 · неделя по времени магазина, полные возвраты, старые отметки, откат и повторное выполнение", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-23T17:15:00Z"), toFake: ["Date"] });
  try {
    const { headers } = await sellerFixture(shopId);
    const legacy = await fixture("completed", orderSnapshot(500), "2026-11-23T16:59:59Z", {
      paidMinor: 560,
      returnedMinor: 60,
      waivedMinor: 0,
      debtOpened: false,
    });
    const returned = await fixture("completed", orderSnapshot(500), "2026-11-23T16:00:00Z", {
      paidMinor: 500,
      returnedMinor: 0,
      waivedMinor: 0,
      debtOpened: false,
    });
    await fixture("completed", orderSnapshot(800), "2026-11-23T17:00:00Z");
    await fixture("cancelled", orderSnapshot(900), "2026-11-22T12:00:00Z");
    const summary = await shopRequest("seller/statistics/summary", headers);
    expect(summary.status).toBe(200);
    expect(salesSummary.parse(await summary.json())).toEqual({
      period: { from: "2026-11-17", to: "2026-11-23" },
      currency: "VND",
      revenueMinor: 1000,
      incomplete: false,
    });
    const warmed = await shopRequest("seller/statistics/summary", headers);
    assertSqlBudget(JSON.parse(warmed.headers.get("x-korzina-sql") ?? "null"), { sql: 4, rowsRead: 8, rowsWritten: 0 });
    await warmed.arrayBuffer();
    const report = async () => {
      const response = await getAuth(`${headersPath}/report?store=lavka`, headers);
      expect(response.status).toBe(200);
      return salesReport.parse(await response.json());
    };
    const refund = (amountMinor: number) =>
      postAuth(
        `/api/seller/orders/${returned}/transition?store=lavka`,
        {
          action: "markRefundReturned",
          expectedRevision: 0,
          allocation: { kind: "items", amountMinor },
        },
        { ...headers, "Idempotency-Key": "455033f9-3b9b-49d9-964a-4c29e42962f0" },
      );
    expect((await refund(501)).status).toBe(400);
    expect((await refund(500)).status).toBe(200);
    expect((await refund(500)).status).toBe(200);
    const afterRefund = await report();
    expect(afterRefund.current).toMatchObject({
      revenueMinor: 500,
      orderCount: 2,
      positiveOrders: 1,
      averageMinor: 500,
    });
    expect(afterRefund.points.at(-1)).toMatchObject({ from: "2026-11-23", revenueMinor: 500 });
    const selection = await getAuth(
      "/api/seller/orders?store=lavka&tab=completed&completedFrom=2026-11-17&completedTo=2026-11-23",
      headers,
    );
    const { orders } = await selection.json<{ orders: { number: number }[] }>();
    expect(orders.map((order) => order.number)).toEqual([legacy, returned]);
    const transition = (action: string, expectedRevision: number) =>
      postAuth(
        `/api/seller/orders/${legacy}/transition?store=lavka`,
        { action, expectedRevision, ...(action === "rollback" ? { reason: "Перепроверка выдачи" } : {}) },
        headers,
      );
    expect((await transition("rollback", 0)).status).toBe(200);
    expect((await report()).current).toMatchObject({ revenueMinor: 0, orderCount: 1, positiveOrders: 0 });
    expect((await transition("markPickedUp", 1)).status).toBe(200);
    expect((await report()).current).toMatchObject({ revenueMinor: 0, orderCount: 1, positiveOrders: 0 });
    const rankResult = await getAuth(`${headersPath}/products?store=lavka`, headers);
    expect(salesRank.parse(await rankResult.json()).rows[0]).toMatchObject({ id: "product-01", quantity: 1, share: 1 });
    const productResult = await getAuth(`${headersPath}/products/product-01?store=lavka`, headers);
    expect(productSales.parse(await productResult.json())).toMatchObject({
      revenueMinor: 0,
      quantity: 1,
      orderCount: 1,
    });
  } finally {
    vi.useRealTimers();
  }
});

it("§10.2 · по старому заказу без даты выполнения сводка показывает неполную историю", async () => {
  await fixture("completed", orderSnapshot(500));
  await catalogSql("DELETE FROM settings WHERE key='sales_projection_zone'");
  const { headers } = await sellerFixture(shopId);
  const response = await getAuth(`${headersPath}/report?store=lavka&from=2026-11-12&to=2026-11-12&compare=0`, headers);
  expect(response.status).toBe(200);
  expect(salesReport.parse(await response.json())).toMatchObject({
    current: { incomplete: true, revenueMinor: null },
    previous: null,
    previousPoints: [],
  });
});

it("§14.5 · сотруднику требуется payments, чужой магазин и отозванное право закрывают чтение", async () => {
  const employee = await sellerFixture(shopId, "employee", ["products"]);
  const permitted = await sellerFixture(shopId, "employee", ["products", "payments"]);
  const outsider = await sellerFixture("korzina-demo-test2");
  const endpoints = ["summary", "report", "days", "products", "products/product-01"];
  for (const endpoint of endpoints) {
    const path = `${headersPath}/${endpoint}?store=lavka`;
    const denied = await getAuth(path, employee.headers);
    expect(denied.status).toBe(403);
    expect(await denied.json()).not.toHaveProperty("revenueMinor");
    expect((await getAuth(path)).status).toBe(401);
    expect((await getAuth(path, outsider.headers)).status).toBe(403);
  }
  const path = `${headersPath}/summary?store=lavka`;
  expect((await getAuth(path, permitted.headers)).status).toBe(200);
  await env.PLATFORM.prepare("UPDATE memberships SET permissions='[]' WHERE account_id=?")
    .bind(permitted.accountId)
    .run();
  expect((await getAuth(path, permitted.headers)).status).toBe(403);
});

it("§14.5 · сотрудник с одним правом payments получает сигнал статистики без данных заказов", async () => {
  const { headers, accountId } = await sellerFixture(shopId, "employee", ["payments"]);
  await env.PLATFORM.prepare("UPDATE memberships SET team_role='custom' WHERE account_id=?").bind(accountId).run();
  expect((await getAuth("/api/seller/orders?store=lavka", headers)).status).toBe(403);
  const ticket = await postAuth("/api/seller/orders/live-ticket?store=lavka", {}, headers);
  expect(ticket.status).toBe(200);
  const { ticket: token } = await ticket.json<{ ticket: string }>();
  const response = await getAuth(`/api/seller/orders/live?store=lavka&ticket=${token}`, {
    ...headers,
    Origin: "https://demo.korzina.app",
    Upgrade: "websocket",
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("Нет соединения");
  try {
    const next = new Promise((resolve) =>
      socket.addEventListener("message", (event) => resolve(JSON.parse(event.data)), { once: true }),
    );
    socket.accept();
    expect(await next).toEqual({ topic: "sales" });
  } finally {
    socket.close();
  }
});
