import type { TimeChoice } from "./contracts/receiving-time";

export const defaultShopTimeZone = "Asia/Ho_Chi_Minh";

const calendar = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "long" });
const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short" });
const clocks = new Map<string, Intl.DateTimeFormat>();

export function shopDateTime(instant: number, timeZone: string) {
  let clock = clocks.get(timeZone);
  if (!clock) {
    clock = new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      dateStyle: "short",
      timeStyle: "short",
      hourCycle: "h23",
    });
    clocks.set(timeZone, clock);
  }
  const [date, time] = clock.format(instant).split(" ");
  return { date, time };
}

export function calendarDate(date: string, offset: number) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

export function formatShopDay(date: string, timeZone: string, now = Date.now(), compact = false) {
  const { date: today } = shopDateTime(now, timeZone);
  const relative = date === today ? "Сегодня" : date === calendarDate(today, 1) ? "Завтра" : undefined;
  if (compact && relative) return relative;
  const instant = Date.parse(`${date}T00:00:00Z`);
  const day = relative ?? weekday.format(instant);
  return `${day[0].toLocaleUpperCase("ru-RU")}${day.slice(1)}, ${calendar.format(instant)}`;
}

function shortDate(date: string) {
  return date.split("-").reverse().join(".");
}

export function formatShopDate(instant: number, timeZone: string) {
  return shortDate(shopDateTime(instant, timeZone).date);
}

export function formatShopTimestamp(instant: number, timeZone: string) {
  const { date, time } = shopDateTime(instant, timeZone);
  return `${shortDate(date)}, ${time}`;
}

export function formatInterval(slotId: string) {
  return slotId.replace("-", "–");
}

export function formatReceivingTime(time: TimeChoice, timeZone: string) {
  const day = formatShopDay(time.date, timeZone);
  return time.slotId ? `${day} · ${formatInterval(time.slotId)}` : day;
}
