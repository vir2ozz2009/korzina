import type { FulfillmentSettings, ReceivingPause } from "../../../src/shared/contracts/receiving";
import type { ReceivingMethod } from "../../../src/shared/contracts/receiving-time";
import { calendarDate, shopDateTime } from "../../../src/shared/datetime";

export const receivingMethods = ["delivery", "pickup"] as const;
const hour = 3_600_000;
const minute = 60_000;
const legacyPause: ReceivingPause = { term: "manual", until: null, startedAt: 0, showBanner: true, message: "" };

export function activePause(settings: FulfillmentSettings, method: ReceivingMethod, now: number) {
  if (!settings.acceptingOrders) return legacyPause;
  const pause = settings.pauses?.[method];
  return pause && (pause.until === null || pause.until > now) ? pause : undefined;
}

export function pauseDeadline(term: ReceivingPause["term"], now: number, timeZone: string) {
  if (term === "manual") return null;
  if (term === "hour") return now + hour;
  const nextDate = calendarDate(shopDateTime(now, timeZone).date, 1);
  // Find the first instant in the next local day, including midnight offset changes.
  let before = Math.floor(now / minute);
  let after = before + 48 * 60;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (shopDateTime(middle * minute, timeZone).date < nextDate) before = middle;
    else after = middle;
  }
  return after * minute;
}

export function moveDayPauses(storage: DurableObjectStorage, timeZone: string, now = Date.now()) {
  const nextMidnight = pauseDeadline("day", now, timeZone);
  for (const method of receivingMethods) {
    const path = `$.pauses.${method}`;
    storage.sql.exec(
      `UPDATE settings SET value=json_set(value,? || '.until',?)
       WHERE key='fulfillment' AND json_extract(value,? || '.term')='day'
       AND json_extract(value,? || '.until')>?`,
      path,
      nextMidnight,
      path,
      path,
      now,
    );
  }
}

export function pauseMessage(method: ReceivingMethod | "all", pause: ReceivingPause, timeZone: string) {
  if (!pause.showBanner) return method === "all" ? "Магазин сейчас не принимает заказы" : "Сейчас недоступно";
  const subject = {
    delivery: "Доставка временно недоступна",
    pickup: "Самовывоз временно недоступен",
    all: "Магазин временно не принимает заказы",
  }[method];
  const time = pause.until === null ? "" : ` до ${shopDateTime(pause.until, timeZone).time}`;
  return `${subject}${time}${pause.message ? `. ${pause.message}` : ""}`;
}

export function pauseStatus(settings: FulfillmentSettings, timeZone: string, now: number) {
  const enabled = receivingMethods.filter((method) => settings[method]);
  const paused = enabled.flatMap((method) => {
    const pause = activePause(settings, method, now);
    return pause ? [{ method, pause }] : [];
  });
  const allPaused = !settings.acceptingOrders || (enabled.length > 0 && enabled.length === paused.length);
  const visible = paused.filter(({ pause }) => pause.showBanner);
  const same = visible.length === 2 && JSON.stringify(visible[0].pause) === JSON.stringify(visible[1].pause);
  const banner = same
    ? pauseMessage("all", visible[0].pause, timeZone)
    : visible.map(({ method, pause }) => pauseMessage(method, pause, timeZone)).join(". ");
  const closedMessage = allPaused ? banner || "Магазин сейчас не принимает заказы" : null;
  const unavailable = Object.fromEntries(
    paused.map(({ method, pause }) => [method, pauseMessage(method, pause, timeZone)]),
  );
  return { acceptingOrders: !allPaused, closedMessage, unavailable, banner: banner || null };
}
