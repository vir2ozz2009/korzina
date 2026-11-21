import { type MethodSchedule, type Preparation, weekdays } from "../../../../shared/contracts/receiving-time";
import type { ReceivingHours } from "../../../../shared/contracts/seller-receiving";
import { clockMinutes, preparationMinutes, splitHours } from "../../../../shared/receiving-hours";
import type { ReceivingHoursData } from "../../settings-api";

export const labels = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };
export const mondayFirst = [...weekdays.slice(1), weekdays[0]];
export type Day = keyof typeof labels;
export type Range = { start: string; end: string };
export type Hours = Omit<ReceivingHours, "interval" | "preparation"> & {
  interval: Exclude<ReceivingHours["interval"], "custom">;
  preparation: Preparation;
};
export const defaultRange = { start: "09:00", end: "20:00" };

function closestInterval(ranges: Range[]) {
  const durations = ranges.map(({ start, end }) => clockMinutes(end) - clockMinutes(start));
  const distance = (hours: number) => durations.reduce((total, duration) => total + Math.abs(duration - hours * 60), 0);
  const closest = ([2, 1, 3] as const).toSorted((a, b) => distance(a) - distance(b))[0];
  return String(closest) as "1" | "2" | "3";
}

function initialHours(settings?: ReceivingHours, schedule?: MethodSchedule): Hours {
  const source = settings ?? schedule;
  const ranges = Object.values(source?.days ?? {}).flat();
  const days = Object.fromEntries(
    mondayFirst.map((day) => {
      const periods = source ? (source.days[day] ?? []) : [defaultRange];
      if (!periods.length) return [day, []];
      const start = periods.map((period) => period.start).sort()[0];
      const end =
        periods
          .map((period) => period.end)
          .sort()
          .at(-1) ?? defaultRange.end;
      return [day, [{ start, end }]];
    }),
  );
  const capacity = ranges[0]?.capacity;
  const interval = settings?.interval ?? schedule?.mode ?? "2";
  const duration = source?.preparationMinutes ?? 60;
  const preparation =
    source?.preparation ??
    (duration >= 1440 ? "next_day" : duration < 30 ? "now" : duration <= 90 ? "hour" : "two_hours");
  return {
    days,
    interval: interval === "custom" || interval === "slots" ? closestInterval(ranges) : interval,
    preparation,
    preparationMinutes: preparationMinutes[preparation],
    dayCutoff: source?.dayCutoff ?? "18:00",
    dayCapacity: source?.dayCapacity,
    capacity: settings?.capacity ?? (ranges.every((range) => range.capacity === capacity) ? capacity : undefined),
  };
}

export function form({ settings, schedule }: ReceivingHoursData) {
  const legacyPickup = schedule?.pickup && JSON.stringify(schedule.pickup) !== JSON.stringify(schedule.delivery);
  const split = settings ? !!settings.pickup : legacyPickup;
  return {
    delivery: initialHours(settings?.delivery, schedule?.delivery ?? schedule?.pickup),
    pickup: split ? initialHours(settings?.pickup, schedule?.pickup) : undefined,
    closedDates: settings?.closedDates ?? schedule?.delivery?.closedDates ?? schedule?.pickup?.closedDates ?? [],
  };
}

export function suggestsSave({ settings, schedule }: ReceivingHoursData) {
  return settings ? !settings.delivery.preparation || (!!settings.pickup && !settings.pickup.preparation) : !!schedule;
}

export function changeDays(hours: Hours, days: Day[], range?: Range): Hours {
  return {
    ...hours,
    days: Object.fromEntries(
      mondayFirst.map((day) => [day, days.includes(day) ? [range ?? hours.days[day]?.[0] ?? defaultRange] : []]),
    ),
  };
}

export function isValid(hours: Hours) {
  return (
    Object.values(hours.days).every((ranges) => ranges.every(({ start, end }) => start < end)) &&
    [hours.capacity, hours.dayCapacity].every(
      (limit) => limit === undefined || (Number.isSafeInteger(limit) && limit >= 1 && limit <= 100_000),
    )
  );
}

export function preview(hours: Hours) {
  const active = mondayFirst.filter((day) => hours.days[day]?.length);
  const range = active.length ? hours.days[active[0]]?.[0] : undefined;
  if (!range) return "Нет рабочих дней";
  if (!isValid(hours)) return "Проверьте часы работы";
  const groups: Day[][] = [];
  for (const day of active) {
    const group = groups.at(-1);
    const last = group?.at(-1);
    if (group && last && mondayFirst.indexOf(last) + 1 === mondayFirst.indexOf(day)) group.push(day);
    else groups.push([day]);
  }
  const days = groups
    .map((group) => (group.length === 1 ? labels[group[0]] : `${labels[group[0]]}–${labels[group[group.length - 1]]}`))
    .join(", ");
  if (hours.interval === "day") return `${days} · В течение дня`;
  if (hours.interval === "after_order") return `${days} · Договоримся после заказа`;
  const intervals = splitHours(range, Number(hours.interval) * 60);
  return `${days} · ${intervals
    .slice(0, 2)
    .map(({ start, end }) => `${start}–${end}`)
    .join(", ")}${intervals.length > 2 ? " …" : ""}`;
}
