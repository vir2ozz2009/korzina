import type { Preparation } from "./contracts/receiving-time";

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
