import {
  type AvailabilityDay,
  type Schedule,
  type TimeChoice,
  weekdays,
} from "../../../src/shared/contracts/receiving-time";

const minute = 60_000;
const day = 24 * 60 * minute;
type MethodSchedule = NonNullable<Schedule["delivery"]>;
type Count = (date: string, slot?: string) => number;

function localEpoch(formatter: Intl.DateTimeFormat, epoch: number) {
  const parts = Object.fromEntries(formatter.formatToParts(epoch).map(({ type, value }) => [type, value]));
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
}

function intervalStart(formatter: Intl.DateTimeFormat, date: string, start: string) {
  const wallTime = Date.parse(`${date}T${start}:00Z`);
  // Probe both sides of a possible DST transition and keep the earliest matching instant.
  const probes = [wallTime - day, wallTime, wallTime + day];
  const candidates = probes.map((probe) => wallTime - (localEpoch(formatter, probe) - probe));
  return Math.min(...candidates.filter((candidate) => localEpoch(formatter, candidate) === wallTime));
}

export function scheduleClock(timeZone: string, now: number) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  const local = new Date(localEpoch(formatter, now)).toISOString();
  return { formatter, today: local.slice(0, 10), localTime: local.slice(11, 16) };
}

export const calendarDate = (today: string, offset: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + offset * day).toISOString().slice(0, 10);

export function scheduledPeriods(schedule: MethodSchedule, date: string) {
  const weekday = weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
  return schedule.days[weekday] ?? [];
}

export function availableDays(
  schedule: MethodSchedule,
  clock: ReturnType<typeof scheduleClock>,
  now: number,
  count: Count,
): AvailabilityDay[] {
  if (schedule.mode === "after_order") return [];
  return Array.from({ length: 7 }, (_, offset) => {
    const date = calendarDate(clock.today, offset);
    const periods = scheduledPeriods(schedule, date);
    if (schedule.mode === "day") {
      const available =
        periods.length > 0 &&
        (offset > 0 || clock.localTime < schedule.dayCutoff) &&
        (schedule.dayCapacity === undefined || count(date) < schedule.dayCapacity);
      return { date, available, intervals: [] };
    }

    const intervals = [...periods]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((period) => {
        const id = `${period.start}-${period.end}`;
        const startAt = intervalStart(clock.formatter, date, period.start);
        const past =
          !Number.isFinite(startAt) || startAt <= now || startAt - now < schedule.preparationMinutes * minute;
        const full = period.capacity !== undefined && count(date, id) >= period.capacity;
        return {
          id,
          start: period.start,
          end: period.end,
          available: !past && !full,
          reason: past ? ("past" as const) : full ? ("full" as const) : undefined,
        };
      });
    return { date, available: intervals.some(({ available }) => available), intervals };
  });
}

export function isAvailable(mode: MethodSchedule["mode"], days: AvailabilityDay[], time: TimeChoice | null) {
  if (mode === "after_order") return time === null;
  if (!time) return false;
  const entry = days.find(({ date }) => date === time.date);
  return (
    !!entry?.available &&
    (mode === "day"
      ? time.slotId === undefined
      : entry.intervals.some(({ id, available }) => id === time.slotId && available))
  );
}
