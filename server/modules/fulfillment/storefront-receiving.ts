import type { StorefrontReceiving } from "../../../src/shared/contracts/receiving-time";
import { shopDateTime } from "../../../src/shared/datetime";
import { readAvailability, readSchedule } from "./availability";
import { activePause, pauseStatus, receivingMethods } from "./pause";
import { readFulfillment } from "./service";

export function storefrontReceiving(
  storage: DurableObjectStorage,
  maps: boolean,
  timeZone: string,
  now = Date.now(),
  settings = readFulfillment(storage, maps),
): StorefrontReceiving {
  const schedule = readSchedule(storage);
  const zone = schedule?.timeZone ?? timeZone;
  const { banners } = pauseStatus(settings, zone, now);
  const pauses = receivingMethods.map((method) => activePause(settings, method, now));
  const methods = receivingMethods.flatMap((method, index): StorefrontReceiving["methods"] => {
    if (!settings[method] || pauses[index]) return [];
    if (!schedule?.[method]) return [{ method, mode: "unknown" }];
    const { mode, days } = readAvailability(storage, method, now, schedule);
    if (mode === "after_order") return [{ method, mode }];
    const next = days.find((day) => day.available);
    if (!next) return [{ method, mode: "unknown" }];
    const slot = next.intervals.find((interval) => interval.available);
    return [{ method, mode, date: next.date, start: slot?.start, end: slot?.end }];
  });
  return {
    today: shopDateTime(now, zone).date,
    timeZone: zone,
    refreshAt: Math.min(now + 60_000, ...pauses.map((pause) => pause?.until ?? Infinity)),
    banners,
    methods,
  };
}
