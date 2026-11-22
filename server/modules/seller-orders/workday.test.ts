import { beforeAll, expect, it } from "vitest";
import { getAuth, sellerFixture } from "../../testing/auth";
import { placeFixtureOrder, proof } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";

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
