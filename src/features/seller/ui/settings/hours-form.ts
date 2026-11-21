import { type MethodSchedule, weekdays } from "../../../../shared/contracts/receiving-time";
import type { ReceivingHours } from "../../../../shared/contracts/seller-receiving";
import type { ReceivingHoursData } from "../../settings-api";

export const labels = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };
export const mondayFirst = [...weekdays.slice(1), weekdays[0]];
export type Day = keyof typeof labels;
export type Range = NonNullable<ReceivingHours["days"][Day]>[number];
export const defaultRange = { start: "09:00", end: "20:00" };

function initialHours(schedule?: MethodSchedule): ReceivingHours {
  const intervals = Object.values(schedule?.days ?? {}).flat();
  const days = Object.fromEntries(
    mondayFirst.map((day) => [day, schedule ? (schedule.days[day] ?? []) : [defaultRange]]),
  );
  return {
    days,
    interval: schedule?.mode === "slots" ? "custom" : (schedule?.mode ?? "2"),
    preparationMinutes: schedule?.preparationMinutes ?? 60,
    dayCutoff: schedule?.dayCutoff ?? "18:00",
    dayCapacity: schedule?.dayCapacity,
    capacity: intervals.every(({ capacity }) => capacity === intervals[0]?.capacity)
      ? intervals[0]?.capacity
      : undefined,
  };
}

export function form(data: ReceivingHoursData) {
  return data.settings
    ? { ...data.settings, pickup: data.settings.pickup }
    : {
        delivery: initialHours(data.schedule?.delivery),
        pickup:
          data.schedule?.pickup && JSON.stringify(data.schedule.pickup) !== JSON.stringify(data.schedule.delivery)
            ? initialHours(data.schedule.pickup)
            : undefined,
        closedDates: data.schedule?.delivery?.closedDates ?? [],
      };
}

export function changeInterval(hours: ReceivingHours, interval: ReceivingHours["interval"]): ReceivingHours {
  if (hours.interval !== "custom" || interval === "custom") return { ...hours, interval };
  // Adjacent saved windows represent continuous working hours. Keep breaks between them.
  const days = Object.fromEntries(
    Object.entries(hours.days).map(([day, ranges]) => {
      const merged: Range[] = [];
      for (const { start, end } of ranges.toSorted((a, b) => a.start.localeCompare(b.start))) {
        const last = merged.at(-1);
        if (last?.end === start) last.end = end;
        else merged.push({ start, end });
      }
      return [day, merged];
    }),
  );
  return { ...hours, interval, days };
}
export function isValid(hours: ReceivingHours) {
  return Object.values(hours.days).every(
    (ranges) =>
      !ranges ||
      ranges.every(({ start, end }, i) => !!start && !!end && start < end && (i === 0 || ranges[i - 1].end <= start)),
  );
}
