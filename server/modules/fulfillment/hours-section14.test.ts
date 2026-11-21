import { exports } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import type { ReceivingHours } from "../../../src/shared/contracts/seller-receiving";
import { sellerFixture } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { availableDays, scheduleClock } from "./schedule";
import { scheduleFromHours } from "./settings";

beforeAll(setupPlatform);

const workingHours: ReceivingHours = {
  days: { wed: [{ start: "10:00", end: "17:00" }], thu: [{ start: "10:00", end: "17:00" }] },
  interval: "2",
  preparation: "now",
  preparationMinutes: 60,
  dayCutoff: "09:00",
};

it("§14.1 §14.2 §14.3 одна неделя для обоих способов, отдельное расписание по запросу, один диапазон в день", async () => {
  const { headers } = await sellerFixture("korzina-demo-test2");
  const put = (body: object) =>
    exports.default.fetch(
      new Request("https://demo.korzina.app/api/seller/receiving/hours?store=test2", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(body),
      }),
    );
  const draft = { expectedRevision: 0, delivery: workingHours, closedDates: [] };
  const saved = await put(draft);
  expect(saved.status).toBe(200);
  const { schedule } = await saved.json<{ schedule: { delivery: unknown; pickup: unknown } }>();
  expect(schedule.pickup).toEqual(schedule.delivery);
  expect(schedule.delivery).toMatchObject({
    days: {
      mon: [],
      wed: [
        { start: "10:00", end: "12:00" },
        { start: "12:00", end: "14:00" },
        { start: "14:00", end: "16:00" },
        { start: "16:00", end: "17:00" },
      ],
    },
  });
  const split = await put({ ...draft, expectedRevision: 1, pickup: { ...workingHours, interval: "day" } });
  expect(split.status).toBe(200);
  expect(await split.json()).toMatchObject({ schedule: { delivery: { mode: "slots" }, pickup: { mode: "day" } } });
  const invalid = await put({
    ...draft,
    expectedRevision: 2,
    delivery: {
      ...workingHours,
      days: {
        wed: [
          { start: "10:00", end: "11:00" },
          { start: "12:00", end: "13:00" },
        ],
      },
    },
  });
  expect(invalid.status).toBe(400);
});

it("§14.4 сроки подготовки, включая завтра с открытия, заменяют отсечку в новом расписании", () => {
  const now = Date.parse("2026-11-18T10:30:00Z");
  const clock = scheduleClock("UTC", now);
  const days = (preparation: ReceivingHours["preparation"], interval: ReceivingHours["interval"] = "2") =>
    availableDays(scheduleFromHours({ ...workingHours, interval, preparation }, []), clock, now, () => 0);
  const first = (preparation: ReceivingHours["preparation"]) =>
    days(preparation)[0].intervals.find(({ available }) => available)?.start;
  expect(first("now")).toBe("12:00");
  expect(first("hour")).toBe("12:00");
  expect(first("two_hours")).toBe("14:00");
  expect(days("next_day")[0].available).toBe(false);
  expect(days("next_day")[1].intervals[0]).toMatchObject({ start: "10:00", available: true });
  expect(days("next_day", "day").slice(0, 2)).toMatchObject([{ available: false }, { available: true }]);
  expect(days("now", "after_order")).toEqual([]);
});

it("§14.5 §14.6 выходная дата и заполненный интервал недоступны, без лимита интервал остаётся открытым", () => {
  const now = Date.parse("2026-11-18T07:00:00Z");
  const clock = scheduleClock("UTC", now);
  const count = () => 4;
  const limited = scheduleFromHours({ ...workingHours, capacity: 4 }, ["2026-11-19"]);
  const dates = availableDays(limited, clock, now, count);
  expect(dates[0].intervals[0]).toMatchObject({ available: false, reason: "full" });
  expect(dates[0]).toMatchObject({ available: false, reason: "full" });
  expect(dates[1]).toMatchObject({ available: false, reason: "closed", intervals: [] });
  const byDay = scheduleFromHours({ ...workingHours, interval: "day", dayCapacity: 4 }, ["2026-11-19"]);
  expect(availableDays(byDay, clock, now, count).slice(0, 2)).toMatchObject([
    { available: false, reason: "full" },
    { available: false, reason: "closed" },
  ]);
  expect(availableDays(scheduleFromHours(workingHours, []), clock, now, count)[0].intervals[0].available).toBe(true);
});
