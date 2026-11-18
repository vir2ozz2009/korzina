import { runInDurableObject } from "cloudflare:test";
import assert from "node:assert/strict";
import { beforeAll, expect, it } from "vitest";
import { scheduleInput } from "../../../src/shared/contracts/receiving-time";
import { assertSqlBudget, RequestMetrics } from "../../metrics";
import { cleanupRecords } from "../../shop/cleanup";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogStub } from "../catalog/testing";
import { readAvailability, reserveTime } from "./availability";
import { availableDays, scheduleClock } from "./schedule";

beforeAll(setupPlatform);

it("строит семь дат по часовому поясу магазина, учитывает расписание и 60 минут на подготовку", () => {
  const schedule = scheduleInput.parse({
    timeZone: "Asia/Ho_Chi_Minh",
    delivery: {
      mode: "slots",
      days: {
        wed: [
          { start: "00:30", end: "02:00" },
          { start: "01:00", end: "03:00" },
        ],
      },
    },
  });
  const now = Date.parse("2026-11-17T17:00:00Z");
  assert(schedule.delivery);
  const days = availableDays(schedule.delivery, scheduleClock(schedule.timeZone, now), now, () => 0);
  expect(days).toHaveLength(7);
  expect(days[0]).toMatchObject({
    date: "2026-11-18",
    available: true,
    intervals: [
      { id: "00:30-02:00", available: false, reason: "past" },
      { id: "01:00-03:00", available: true },
    ],
  });
  expect(days[1]).toMatchObject({ date: "2026-11-19", available: false, intervals: [] });
});

it("после отсечки сегодня недоступно, лимит дня учитывается, после заказа даты не предлагаются", () => {
  const schedule = scheduleInput.parse({
    timeZone: "Asia/Ho_Chi_Minh",
    delivery: {
      mode: "day",
      dayCapacity: 2,
      days: {
        wed: [{ start: "09:00", end: "20:00" }],
        thu: [{ start: "09:00", end: "20:00" }],
      },
    },
    pickup: { mode: "after_order", days: {} },
  });
  const now = Date.parse("2026-11-18T11:00:00Z");
  const clock = scheduleClock(schedule.timeZone, now);
  assert(schedule.delivery);
  assert(schedule.pickup);
  const days = availableDays(schedule.delivery, clock, now, (date) => (date === "2026-11-19" ? 2 : 0));
  expect(days.slice(0, 2)).toMatchObject([{ available: false }, { available: false }]);
  expect(availableDays(schedule.delivery, clock, now, () => 0)[1]?.available).toBe(true);
  expect(availableDays(schedule.pickup, clock, now, () => 0)).toEqual([]);
});

it("считает расписание двумя SQL, последнее место атомарно занимает один заказ и счётчики истекают", async () => {
  const now = Date.parse("2026-11-18T01:00:00Z");
  const stub = catalogStub();
  const choice = { date: "2026-11-18", slotId: "10:00-12:00" };
  await runInDurableObject(stub, (_shop, { storage }) => {
    const metrics = new RequestMetrics();
    expect(readAvailability(metrics.storage(storage), "delivery", now).days[0]?.intervals[0]?.available).toBe(true);
    assertSqlBudget(metrics.snapshot(), { sql: 2, rowsWritten: 0 });
    for (let i = 0; i < 3; i++) storage.transactionSync(() => reserveTime(storage, "delivery", choice, now));
  });

  const book = () =>
    runInDurableObject(stub, (_shop, { storage }) => {
      try {
        storage.transactionSync(() => reserveTime(storage, "delivery", choice, now));
        return "booked";
      } catch {
        return "full";
      }
    });
  expect((await Promise.all([book(), book()])).sort()).toEqual(["booked", "full"]);

  await runInDurableObject(stub, (_shop, { storage }) => {
    expect(readAvailability(storage, "delivery", now).days[0]?.intervals[0]).toMatchObject({ reason: "full" });
    cleanupRecords(storage, Date.parse("2026-11-21T00:00:00Z"));
    expect(storage.sql.exec("SELECT booked FROM receiving_seats").toArray()).toEqual([]);
  });
});

it("записывает время с общей ревизией корзины и очищает его при переключении способа", async () => {
  const cookie = cookieFrom(await postAuth("/api/auth/guest?shop=test2"));
  const headers = { Cookie: cookie };
  const receivingPath = "/api/receiving?shop=test2";
  const pickup = { mode: "pickup" };
  expect((await postAuth(receivingPath, { expectedRevision: 0, receiving: pickup }, headers)).status).toBe(200);
  const availability = await (await getAuth("/api/receiving/availability?shop=test2&method=pickup")).json<{
    days: { date: string; intervals: { id: string }[] }[];
  }>();
  const tomorrow = availability.days[1];
  const time = { date: tomorrow.date, slotId: tomorrow.intervals[0].id };
  const command = (expectedRevision: number) =>
    postAuth("/api/receiving/time?shop=test2", { expectedRevision, time }, headers);
  expect((await command(0)).status).toBe(409);
  expect(await (await command(1)).json()).toMatchObject({ revision: 2, time });
  expect(await (await getAuth(receivingPath, headers)).json()).toMatchObject({ revision: 2, time });
  expect(
    await (
      await postAuth(
        receivingPath,
        {
          expectedRevision: 2,
          receiving: { mode: "delivery", address: "28 Lê Lợi", acceptedWithoutPoint: true },
        },
        headers,
      )
    ).json(),
  ).toMatchObject({ revision: 3, time: null });
});
