import { type MethodSchedule, weekdays } from "../../../../shared/contracts/receiving-time";
import type { ReceivingHours } from "../../../../shared/contracts/seller-receiving";
import type { ReceivingHoursData } from "../../settings-api";

export const labels = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };
export const mondayFirst = [...weekdays.slice(1), weekdays[0]];
export type Day = keyof typeof labels;
export type Range = NonNullable<ReceivingHours["days"][Day]>[number];
export const defaultRange = { start: "09:00", end: "20:00" };

function initialHours(schedule?: MethodSchedule): ReceivingHours {
  const days = Object.fromEntries(
    mondayFirst.map((day) => {
      const ranges = schedule?.days[day];
      return [
        day,
        ranges?.length
          ? [{ start: ranges[0].start, end: ranges.at(-1)?.end ?? "20:00" }]
          : schedule?.mode === "slots" || schedule?.mode === "day"
            ? []
            : [defaultRange],
      ];
    }),
  );
  return {
    days,
    interval: schedule?.mode === "after_order" ? "after_order" : schedule?.mode === "day" ? "day" : "2",
    preparationMinutes: schedule?.preparationMinutes ?? 60,
    dayCutoff: schedule?.dayCutoff ?? "18:00",
    dayCapacity: schedule?.dayCapacity,
    capacity: schedule?.days.mon?.[0]?.capacity,
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
export function isValid(hours: ReceivingHours) {
  return Object.values(hours.days).every(
    (ranges) =>
      !ranges ||
      ranges.every(({ start, end }, i) => !!start && !!end && start < end && (i === 0 || ranges[i - 1].end <= start)),
  );
}
