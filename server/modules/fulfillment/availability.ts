import {
  type ReceivingMethod,
  scheduleInput,
  type TimeChoice,
  type TimeCommand,
} from "../../../src/shared/contracts/receiving-time";
import { calendarDate } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import { availableDays, isAvailable, scheduleClock, scheduledPeriods } from "./schedule";
import { readFulfillment, readReceiving, writeReceiving } from "./service";

export function readSchedule(storage: DurableObjectStorage) {
  const row = storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='receiving_schedule'")
    .toArray()[0];
  return row ? scheduleInput.parse(JSON.parse(row.value)) : null;
}

function availabilityFor(storage: DurableObjectStorage, method: ReceivingMethod, now: number) {
  const schedule = readSchedule(storage);
  const methodSchedule = schedule?.[method];
  if (!schedule || !methodSchedule) throw new ApiError("NOT_FOUND", "Расписание недоступно");
  const { timeZone } = schedule;
  const { mode } = methodSchedule;
  if (mode === "after_order") return { methodSchedule, response: { mode, timeZone, days: [] } };
  const clock = scheduleClock(timeZone, now);
  const rows = storage.sql
    .exec<{ date: string; slot: string; booked: number }>(
      "SELECT date,slot,booked FROM receiving_seats WHERE method=? AND date BETWEEN ? AND ?",
      method,
      clock.today,
      calendarDate(clock.today, 6),
    )
    .toArray();
  const counts = new Map(rows.map((row) => [`${row.date}/${row.slot}`, row.booked]));
  const daily = new Map<string, number>();
  for (const { date, booked } of rows) daily.set(date, (daily.get(date) ?? 0) + booked);
  const days = availableDays(methodSchedule, clock, now, (date, slot) =>
    slot === undefined ? (daily.get(date) ?? 0) : (counts.get(`${date}/${slot}`) ?? 0),
  );
  return { methodSchedule, response: { mode, timeZone, days } };
}

export function readAvailability(storage: DurableObjectStorage, method: ReceivingMethod, now = Date.now()) {
  return availabilityFor(storage, method, now).response;
}

function unavailableTime() {
  return new ApiError("SLOT_TAKEN", "Время недоступно. Выберите другое время.");
}

export function saveTime(storage: DurableObjectStorage, subject: string, input: TimeCommand, maps: boolean) {
  return storage.transactionSync(() => {
    const { revision, ...current } = readReceiving(storage, subject);
    if (revision !== input.expectedRevision)
      throw new ApiError("VERSION_CONFLICT", "Корзина изменилась. Попробуйте ещё раз.", { revision, ...current });
    if (!current.receiving) throw new ApiError("VALIDATION", "Выберите способ получения");
    const { time } = input;
    if (time) {
      if (!readFulfillment(storage, maps)[current.receiving.mode])
        throw new ApiError("NOT_FOUND", "Способ получения недоступен");
      const availability = readAvailability(storage, current.receiving.mode);
      if (!isAvailable(availability.mode, availability.days, time)) throw unavailableTime();
    }
    if (JSON.stringify(current.time) === JSON.stringify(time)) return { revision, ...current };
    const updated = { ...current, time, receivingUpdatedAt: Date.now() };
    writeReceiving(storage, subject, revision + 1, updated);
    return { revision: revision + 1, ...updated };
  });
}

// Called inside the same SQLite transaction that writes an order. Selecting time does not reserve it.
export function reserveTime(
  storage: DurableObjectStorage,
  method: ReceivingMethod,
  time: TimeChoice | null,
  now = Date.now(),
) {
  const { methodSchedule, response: availability } = availabilityFor(storage, method, now);
  if (!isAvailable(availability.mode, availability.days, time)) throw unavailableTime();
  if (!time) return false;
  const capacity =
    methodSchedule.mode === "day"
      ? methodSchedule.dayCapacity
      : scheduledPeriods(methodSchedule, time.date).find((period) => `${period.start}-${period.end}` === time.slotId)
          ?.capacity;
  if (capacity === undefined && methodSchedule.dayCapacity === undefined) return false;
  const expiresAt = Date.parse(`${calendarDate(time.date, 2)}T00:00:00Z`);
  const result = storage.sql.exec(
    `INSERT INTO receiving_seats(method,date,slot,booked,expires_at) VALUES(?,?,?,1,?)
     ON CONFLICT(method,date,slot) DO UPDATE SET booked=booked+1 WHERE booked < ?`,
    method,
    time.date,
    time.slotId ?? "",
    expiresAt,
    capacity ?? methodSchedule.dayCapacity ?? Number.MAX_SAFE_INTEGER,
  );
  if (!result.rowsWritten) throw unavailableTime();
  return true;
}
