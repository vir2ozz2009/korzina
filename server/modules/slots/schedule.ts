import type { CollectionSlot, Schedule } from "../../../src/shared/contracts/slots";
import { day } from "../../shop/cleanup";

const minute = 60_000;
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

function wallTimeReader(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (time: number) => Date.parse(`${formatter.format(time).replace(" ", "T")}:00Z`);
}

export function slotCalendar(schedule: Schedule, now: number, occupancy: ReadonlyMap<number, number>) {
  const wallTime = wallTimeReader(schedule.timeZone);
  const today = Date.parse(`${isoDay(wallTime(now))}T00:00:00Z`);
  const days = Array.from({ length: 7 }, (_, offset) => ({
    date: isoDay(today + offset * day),
    closed: true,
    slots: [] as CollectionSlot[],
  }));

  // Convert wall-clock starts to instants, including both occurrences in a repeated DST hour.
  // A nonexistent wall-clock time is skipped.
  const shifts = new Set<number>();
  for (let offset = -2; offset <= 8; offset++) shifts.add(wallTime(today + offset * day) - (today + offset * day));
  const instants = (wall: number) => [...shifts].map((shift) => wall - shift).filter((time) => wallTime(time) === wall);
  const seen = new Set<number>();
  const weekday = (date: number) => new Date(date).getUTCDay();
  for (let offset = -1; offset < 7; offset++) {
    const date = today + offset * day;
    for (const window of schedule.windows.filter((item) => item.weekday === weekday(date))) {
      const limit = window.to <= window.from ? 1440 + window.to : window.to;
      for (let start = window.from; start + schedule.slotMinutes <= limit; start += schedule.slotMinutes) {
        const wall = date + start * minute;
        const entry = days[Math.floor((wall - today) / day)];
        if (!entry) continue;
        entry.closed = false;
        const end = wall + schedule.slotMinutes * minute;
        for (const startAt of instants(wall)) {
          if (seen.has(startAt)) continue;
          const endAt = instants(end)
            .filter((time) => time > startAt)
            .sort((a, b) => a - b)[0];
          if (endAt === undefined) continue;
          seen.add(startAt);
          entry.slots.push({
            startAt,
            endAt,
            available: startAt > now && (occupancy.get(startAt) ?? 0) < schedule.capacity,
          });
        }
      }
    }
  }
  for (const entry of days) entry.slots.sort((a, b) => a.startAt - b.startAt);
  const nextAvailableDate = days.find(({ slots }) => slots.some((slot) => slot.available))?.date ?? null;
  return { timeZone: schedule.timeZone, days, nextAvailableDate, asap: schedule.asap && nextAvailableDate !== null };
}
