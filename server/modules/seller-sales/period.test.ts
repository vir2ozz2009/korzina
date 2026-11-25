import { env } from "cloudflare:workers";
import { beforeAll, expect, it, vi } from "vitest";
import { productSales, salesRank, salesReport, salesSummary } from "../../../src/shared/contracts/seller-sales";
import { calendarDate } from "../../../src/shared/datetime";
import { getAuth, sellerFixture } from "../../testing/auth";
import { snapshot } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";

const shop = "korzina-demo-lavka";
const root = "/api/seller/statistics";
beforeAll(setupPlatform);

it("§10.2, §14.5 · за период без подтверждённых строк неполная история не становится нулём", async () => {
  const { headers } = await sellerFixture(shop);
  await catalogSql(
    "INSERT INTO orders(customer,created_at,status,payment_status,snapshot) VALUES('guest:legacy-sales',?,'completed','confirmed',?)",
    Date.parse("2026-10-01T08:30:00Z"),
    JSON.stringify(snapshot),
  );
  await catalogSql("DELETE FROM settings WHERE key='sales_projection_zone'");
  const query = "store=lavka&from=2026-10-01&to=2026-10-01";
  const product = await getAuth(`${root}/products/product-01?${query}`, headers);
  expect(productSales.parse(await product.json())).toMatchObject({
    incomplete: true,
    quantity: null,
    orderCount: null,
    revenueMinor: null,
  });
  const ranking = await getAuth(`${root}/products?${query}`, headers);
  expect(salesRank.parse(await ranking.json()).rows[0]).toMatchObject({
    incomplete: true,
    quantity: null,
    share: null,
  });
});

it("§9.3 · границы час/день/неделя/месяц, неполные интервалы и локальные сутки 23/25 часов", async () => {
  const { headers } = await sellerFixture(shop);
  const from = "2026-01-15";
  const read = (from: string, to: string, compare?: boolean) =>
    getAuth(`${root}/report?store=lavka&from=${from}&to=${to}${compare ? "" : "&compare=0"}`, headers)
      .then((response) => response.json())
      .then((response) => salesReport.parse(response));
  for (const [length, unit] of [
    [1, "hour"],
    [2, "day"],
    [31, "day"],
    [32, "week"],
    [180, "week"],
    [181, "month"],
  ] as const) {
    const to = calendarDate(from, length - 1);
    const report = await read(from, to, true);
    expect(report.unit).toBe(unit);
    if (unit !== "hour") {
      expect(report.points[0].from).toBe(from);
      expect(report.points.at(-1)?.to).toBe(to);
      expect(report.previousPoints[0].from).toBe(calendarDate(from, -length));
      expect(report.previousPoints.at(-1)?.to).toBe(calendarDate(from, -1));
    }
  }
  await catalogSql(
    "UPDATE settings SET value=json_set(value,'$.timeZone','America/New_York') WHERE key='receiving_schedule'",
  );
  try {
    expect((await read("2026-03-08", "2026-03-08")).points).toHaveLength(23);
    expect((await read("2026-11-01", "2026-11-01")).points).toHaveLength(25);
  } finally {
    await catalogSql(
      "UPDATE settings SET value=json_set(value,'$.timeZone','Asia/Ho_Chi_Minh') WHERE key='receiving_schedule'",
    );
  }
});

it("§14.1, §14.4 и сценарий 24 · даты определяет магазин, переход в товар требует отдельного права", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-24T16:59:59Z"), toFake: ["Date"] });
  try {
    const owner = await sellerFixture(shop);
    const employee = await sellerFixture(shop, "employee", ["payments"]);
    await env.PLATFORM.prepare("UPDATE memberships SET team_role='custom' WHERE account_id=?")
      .bind(employee.accountId)
      .run();
    const summary = () =>
      getAuth(`${root}/summary?store=lavka`, owner.headers)
        .then((response) => response.json())
        .then((response) => salesSummary.parse(response));
    expect((await summary()).period).toEqual({ from: "2026-11-17", to: "2026-11-23" });
    vi.setSystemTime(new Date("2026-11-24T17:00:00Z"));
    expect((await summary()).period).toEqual({ from: "2026-11-18", to: "2026-11-24" });
    const path = `${root}/products/product-01?store=lavka`;
    const get = (headers: typeof owner.headers) =>
      getAuth(path, headers)
        .then((response) => response.json())
        .then((response) => productSales.parse(response));
    expect(await get(owner.headers)).toMatchObject({
      canOpenProduct: true,
      period: { from: "2026-11-18", to: "2026-11-24" },
    });
    expect((await get(employee.headers)).canOpenProduct).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
