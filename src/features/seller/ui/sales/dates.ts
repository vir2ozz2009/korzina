import type { SalesPeriod } from "../../../../shared/contracts/seller-sales";
import { calendarDate, shopDateTime } from "../../../../shared/datetime";

const formatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const date = (value: string) => new Date(`${value}T00:00:00Z`);
export function periodLabel({ from, to }: SalesPeriod) {
  if (from === to) return formatter.format(date(to));
  if (from.slice(0, 7) === to.slice(0, 7)) return `${date(from).getUTCDate()}–${formatter.format(date(to))}`;
  return formatter.formatRange(date(from), date(to));
}

export function periodPreset(timeZone: string, number: number, completed: boolean): SalesPeriod {
  const { date } = shopDateTime(Date.now(), timeZone);
  const to = calendarDate(date, completed ? -1 : 0);
  return { from: calendarDate(to, 1 - number), to };
}

export function lengthInDays({ from, to }: SalesPeriod) {
  return (date(to).getTime() - date(from).getTime()) / 86_400_000 + 1;
}
