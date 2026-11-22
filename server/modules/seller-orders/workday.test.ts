import { beforeAll, expect, it } from "vitest";
import { assertSqlBudget } from "../../metrics";
import { getAuth, sellerFixture } from "../../testing/auth";
import { placeFixtureOrder, proof } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, shopRequest } from "../catalog/testing";

beforeAll(setupPlatform);

it("§9.1, §11.1, §12–§14: сводка, фильтр, календарь и детали сборки используют тот же день", async () => {
  const owner = await sellerFixture("korzina-demo-lavka");
  const customer = "guest:workday";
  const numbers = await Promise.all(
    Array.from({ length: 3 }, async () => placeFixtureOrder(customer, await proof(customer, "attached"))),
  );
  const [upcoming, packed, cancelled] = numbers;
  const time = { date: "2099-11-22", slotId: "14:00-16:00" };
  await catalogSql("UPDATE orders SET snapshot=json_set(snapshot,'$.time',json(?))", JSON.stringify(time));
  await catalogSql(
    "UPDATE orders SET fulfillment_state=json_object('packed',json_array('sku-01')) WHERE number=?",
    packed,
  );
  await catalogSql("UPDATE orders SET status='cancelled' WHERE number=?", cancelled);
  const read = async (path: string) => {
    const response = await getAuth(`/api/seller/orders${path}`, owner.headers);
    expect(response.status).toBe(200);
    return response.json();
  };
  expect(await read("/packing?store=lavka&day=2099-11-22")).toMatchObject({
    hasTimes: true,
    windows: [
      {
        id: "14:00-16:00",
        count: 1,
        rows: [
          {
            name: "Томаты",
            quantity: 1,
            orders: [{ number: upcoming, quantity: 1 }],
          },
        ],
      },
    ],
  });
  expect(await read("/calendar?store=lavka&month=2099-11")).toMatchObject({
    month: "2099-11",
    counts: { "2099-11-22": 3, "2099-11-23": 0 },
  });
  expect(await read("?store=lavka&day=2099-11-22&focus=placed")).toMatchObject({
    counts: { placed: 2 },
    orders: expect.arrayContaining([expect.objectContaining({ number: upcoming })]),
  });
  const summary = (await read("/workday?store=lavka")) as { version: string };
  expect(summary).toMatchObject({ count: 0, stages: { placed: 0 }, actions: { accept: 0, receipt: 2 } });
  expect(await read(`/workday?store=lavka&version=${encodeURIComponent(summary.version)}`)).toMatchObject({
    unchanged: true,
  });
});

it("Блок 9 · 03: календарь сверяет неизменившийся месяц одним SQL и перечитывает его при новой ревизии", async () => {
  const { headers } = await sellerFixture("korzina-demo-lavka");
  await catalogSql("SELECT 1");
  const calendar = (version?: string) =>
    shopRequest(
      `seller/orders/calendar?${new URLSearchParams({ month: "2099-11", ...(version && { version }) })}`,
      headers,
    );
  const initial = await calendar();
  expect(initial.status).toBe(200);
  const { version } = await initial.json<{ version: string }>();
  expect(version).toBeTruthy();
  assertSqlBudget(JSON.parse(initial.headers.get("x-korzina-sql") ?? "null"), { sql: 2, rowsWritten: 0 });

  const cached = await calendar(version);
  expect(await cached.json()).toEqual({ unchanged: true });
  assertSqlBudget(JSON.parse(cached.headers.get("x-korzina-sql") ?? "null"), { sql: 1, rowsRead: 1, rowsWritten: 0 });

  const buyer = "guest:calendar-budget";
  const order = await placeFixtureOrder(buyer, await proof(buyer, "attached"));
  await catalogSql(
    "UPDATE orders SET snapshot=json_set(snapshot,'$.time',json(?)) WHERE number=?",
    JSON.stringify({ date: "2099-11-25", slotId: "14:00-16:00" }),
    order,
  );
  expect(await (await calendar(version)).json()).toMatchObject({ counts: { "2099-11-25": 1 } });
});

it("Блок 9 · 08: §11.3 без права «Деньги» сводка и списки не содержат сумм", async () => {
  const owner = await sellerFixture("korzina-demo-lavka");
  const picker = await sellerFixture("korzina-demo-lavka", "employee", ["orders", "assembly"]);
  const buyer = "guest:workday-permissions";
  const active = await placeFixtureOrder(buyer, await proof(buyer, "attached"));
  const closed = await placeFixtureOrder(buyer, await proof(buyer, "attached"));
  await catalogSql("UPDATE orders SET status='completed' WHERE number=?", closed);
  await catalogSql("UPDATE seller_order_index SET refund_minor=9000 WHERE number=?", active);
  await catalogSql("UPDATE seller_order_index SET debt_minor=17000 WHERE number=?", closed);
  const read = async (path: string, headers = owner.headers) => {
    const response = await getAuth(`/api/seller/orders${path}`, headers);
    expect(response.status).toBe(200);
    return response.json();
  };
  const summary = (await read("/workday?store=lavka")) as { version: string };
  expect(summary).toMatchObject({ count: 2, currency: "VND", totalMinor: 98000, debtMinor: 17000 });
  const restricted = await read(`/workday?store=lavka&version=${encodeURIComponent(summary.version)}`, picker.headers);
  expect(restricted).toMatchObject({ count: 2 });
  for (const key of ["totalMinor", "debtMinor", "currency", "actions.receipt", "actions.payment"])
    expect(restricted).not.toHaveProperty(key);

  for (const [tab, number, amounts] of [
    ["active", active, { refundMinor: 9000 }],
    ["completed", closed, { debtMinor: 17000 }],
  ] as const) {
    const path = `?store=lavka&tab=${tab}`;
    const page = (await read(path)) as { rev: number; orders: { number: number }[] };
    expect(page.orders).toContainEqual(expect.objectContaining({ number, totalMinor: 49000, ...amounts }));
    const restrictedPage = (await read(`${path}&rev=${page.rev}&cachedMoney=1`, picker.headers)) as typeof page;
    expect(restrictedPage.orders.map((order) => order.number)).toEqual(page.orders.map((order) => order.number));
    for (const order of restrictedPage.orders)
      for (const key of ["totalMinor", "debtMinor", "refundMinor", "currency"]) expect(order).not.toHaveProperty(key);
    expect(await read(`${path}&rev=${page.rev}&cachedMoney=0`, picker.headers)).toMatchObject({ unchanged: true });
  }
  for (const query of ["focus=receipt", "focus=payment", "focus=debt", "tab=completed&debt=1"])
    expect((await getAuth(`/api/seller/orders?store=lavka&${query}`, picker.headers)).status).toBe(403);
});
