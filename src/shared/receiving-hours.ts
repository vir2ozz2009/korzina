import type { AvailabilityDay, MethodSchedule, Preparation, TimeChoice } from "./contracts/receiving-time";

export const timeChangedMessage = "Время изменилось, выберите заново";

export function requiresReceivingTime(mode: MethodSchedule["mode"], days: AvailabilityDay[]) {
  return mode !== "after_order" && days.some(({ available }) => available);
}

export function isTimeAvailable(mode: MethodSchedule["mode"], days: AvailabilityDay[], time: TimeChoice | null) {
  if (!time) return !requiresReceivingTime(mode, days);
  if (mode === "after_order") return false;
  const day = days.find(({ date }) => date === time.date);
  return (
    !!day?.available &&
    (mode === "day"
      ? time.slotId === undefined
      : day.intervals.some(({ id, available }) => id === time.slotId && available))
  );
}

export const preparationMinutes = { now: 0, hour: 60, two_hours: 120, next_day: 0 } satisfies Record<
  Preparation,
  number
>;
export const clockMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const clockTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function splitHours({ start, end }: { start: string; end: string }, step: number) {
  const from = clockMinutes(start);
  const to = clockMinutes(end);
  return Array.from({ length: Math.ceil((to - from) / step) }, (_, index) => ({
    start: clockTime(from + index * step),
    end: clockTime(Math.min(to, from + (index + 1) * step)),
  }));
}
