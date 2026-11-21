import { fulfillmentSettingsInput } from "../../../src/shared/contracts/receiving";
import { type MethodSchedule, weekdays } from "../../../src/shared/contracts/receiving-time";
import type {
  ReceivingHours,
  SaveReceivingHours,
  SaveReceivingPause,
  SaveReceivingSettings,
} from "../../../src/shared/contracts/seller-receiving";
import { ApiError } from "../../../src/shared/errors";
import { preparationMinutes as durations, splitHours } from "../../../src/shared/receiving-hours";
import type { Seller } from "../../auth/roles";
import type { ShopEnv } from "../../shop/env";
import { shopTimeZoneSql } from "../../shop/time-zone";
import { readSchedule } from "./availability";
import { activePause, pauseDeadline, receivingMethods } from "./pause";
import { resolveFulfillment } from "./service";

type Env = ShopEnv["Bindings"];
type Section = "receiving" | "hours" | "pause";
export type SettingsRevision = { revision: number; author?: string; updatedAt?: number };

function storeSetting(storage: DurableObjectStorage, key: string, data: unknown) {
  storage.sql.exec(
    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    key,
    JSON.stringify(data),
  );
}

function readSetting(storage: DurableObjectStorage, key: string) {
  return storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key=?", key).toArray()[0]?.value;
}

function revision(storage: DurableObjectStorage, section: Section): SettingsRevision {
  const value = readSetting(storage, `seller_${section}_revision`);
  return value ? JSON.parse(value) : { revision: 0 };
}

function assertRevision(storage: DurableObjectStorage, section: Section, expected: number) {
  const current = revision(storage, section);
  if (current.revision !== expected) throw new ApiError("VERSION_CONFLICT", "Настройки изменились", current);
}

function advanceRevision(storage: DurableObjectStorage, section: Section, seller: Seller, now = Date.now()) {
  const current = revision(storage, section);
  storeSetting(storage, `seller_${section}_revision`, {
    revision: current.revision + 1,
    author: seller.accountId,
    updatedAt: now,
  });
}

export function readReceivingSettings(env: Env, seller: Seller) {
  const { storage, features, shop } = env;
  const saved = readSetting(storage, "fulfillment");
  const settings = resolveFulfillment(saved, features.maps);
  const actual = resolveFulfillment(saved, true);
  const payment = readSetting(storage, "purchase_payment");
  const { currency } = storage.sql.exec<{ currency: string }>("SELECT currency FROM catalog_state WHERE id=1").one();
  const { delivery, pickup, requiredDetails } = settings;
  return {
    ...revision(storage, "receiving"),
    canWrite: seller.role === "owner",
    maps: features.maps,
    currency,
    mapsFallback: !features.maps && actual.delivery?.mode === "map",
    delivery,
    pickup,
    requiredDetails,
    minimumMinor: payment ? Number(JSON.parse(payment).minimumMinor ?? 0) : 0,
    shopStatus: shop.status,
  };
}

export function updateReceivingSettings(
  env: Env,
  seller: Seller,
  { expectedRevision, minimumMinor, ...input }: SaveReceivingSettings,
) {
  const { storage } = env;
  assertRevision(storage, "receiving", expectedRevision);
  const saved = readSetting(storage, "fulfillment");
  const existing = resolveFulfillment(saved, true);
  if (!env.features.maps && input.delivery?.mode === "map")
    throw new ApiError("FEATURE_DISABLED", "Карта отключена. Проверьте условия доставки.");
  let delivery = input.delivery;
  if (!env.features.maps && existing.delivery?.mode === "map" && delivery?.mode === "text") {
    const { tariff, payee } = delivery;
    delivery = {
      ...existing.delivery,
      payee,
      zones: existing.delivery.zones.map((zone, index) => (index ? zone : { ...zone, tariff })),
    };
  }
  storeSetting(
    storage,
    "fulfillment",
    fulfillmentSettingsInput.parse({ ...existing, ...input, delivery, pickup: input.pickup }),
  );
  ensureReceivingSchedule(storage, Boolean(delivery), Boolean(input.pickup));
  storage.sql.exec(
    `INSERT INTO settings(key,value) VALUES('purchase_payment',json_object('minimumMinor',?,'methods',json('[]')))
      ON CONFLICT(key) DO UPDATE SET value=json_set(value,'$.minimumMinor',?)`,
    minimumMinor,
    minimumMinor,
  );
  advanceRevision(storage, "receiving", seller);
  return readReceivingSettings(env, seller);
}

export function readReceivingHours(env: Env, seller: Seller) {
  const form = readSetting(env.storage, "seller_receiving_hours");
  const schedule = readSchedule(env.storage);
  return {
    ...revision(env.storage, "hours"),
    canWrite: seller.role === "owner",
    settings: form ? (JSON.parse(form) as Omit<SaveReceivingHours, "expectedRevision">) : null,
    schedule,
    timeZone: schedule?.timeZone ?? timeZone(env.storage),
  };
}

export function scheduleFromHours(
  input: ReceivingHours,
  closedDates: string[],
  previous?: MethodSchedule,
): MethodSchedule {
  const { days, interval, capacity, dayCapacity, preparation, preparationMinutes, dayCutoff } = input;
  const mode = interval === "after_order" ? "after_order" : interval === "day" ? "day" : "slots";
  const custom = interval === "custom";
  const step = mode === "slots" && !custom ? Number(interval) * 60 : 1440;
  return {
    mode,
    dayCapacity: !preparation || mode === "day" ? dayCapacity : undefined,
    preparation,
    preparationMinutes: preparation ? durations[preparation] : preparationMinutes,
    dayCutoff,
    closedDates,
    cutoffForSlots: !preparation && (!custom || previous?.cutoffForSlots === true || previous?.dayCutoff !== dayCutoff),
    days: Object.fromEntries(
      weekdays.map((day) => [
        day,
        (days[day] ?? [])
          .toSorted((a, b) => a.start.localeCompare(b.start))
          .flatMap(({ start, end, capacity: windowCapacity }) =>
            splitHours({ start, end }, step).map((range) => ({
              ...range,
              capacity: custom ? windowCapacity : !preparation || mode === "slots" ? capacity : undefined,
            })),
          ),
      ]),
    ),
  };
}

function timeZone(storage: DurableObjectStorage) {
  return storage.sql.exec<{ timeZone: string }>(`SELECT ${shopTimeZoneSql} AS timeZone`).one().timeZone;
}

function ensureReceivingSchedule(storage: DurableObjectStorage, delivery: boolean, pickup: boolean) {
  if (!delivery && !pickup) return;
  const current = readSchedule(storage);
  if ((!delivery || current?.delivery) && (!pickup || current?.pickup)) return;
  const defaultHours: ReceivingHours = {
    days: Object.fromEntries(weekdays.map((day) => [day, [{ start: "09:00", end: "20:00" }]])),
    interval: "2",
    preparationMinutes: 60,
    preparation: "hour",
    dayCutoff: "18:00",
  };
  const existing = current?.delivery ?? current?.pickup;
  const defaults = existing ?? scheduleFromHours(defaultHours, []);
  if (!existing) storeSetting(storage, "seller_receiving_hours", { delivery: defaultHours, closedDates: [] });
  storeSetting(storage, "receiving_schedule", {
    ...current,
    timeZone: current?.timeZone ?? timeZone(storage),
    delivery: current?.delivery ?? (delivery ? defaults : undefined),
    pickup: current?.pickup ?? (pickup ? defaults : undefined),
  });
}

export function updateReceivingHours(env: Env, seller: Seller, { expectedRevision, ...input }: SaveReceivingHours) {
  const { storage } = env;
  assertRevision(storage, "hours", expectedRevision);
  const { delivery, pickup, closedDates } = input;
  const current = delivery.interval === "custom" || pickup?.interval === "custom" ? readSchedule(storage) : null;
  storeSetting(storage, "receiving_schedule", {
    timeZone: timeZone(storage),
    delivery: scheduleFromHours(delivery, closedDates, current?.delivery),
    pickup: scheduleFromHours(pickup ?? delivery, closedDates, pickup ? current?.pickup : current?.delivery),
  });
  storeSetting(storage, "seller_receiving_hours", input);
  advanceRevision(storage, "hours", seller);
  return readReceivingHours(env, seller);
}

export function readReceivingPauses(env: Env, seller: Seller, now = Date.now()) {
  const { storage, shop, features } = env;
  const settings = resolveFulfillment(readSetting(storage, "fulfillment"), features.maps);
  const adminPaused = shop.status !== "active";
  return {
    ...revision(storage, "pause"),
    timeZone: timeZone(storage),
    adminPaused,
    canWrite: !adminPaused && (seller.role === "owner" || seller.permissions.includes("orders")),
    methods: receivingMethods
      .filter((method) => settings[method])
      .map((method) => ({
        method,
        pause: activePause(settings, method, now) ?? null,
      })),
  };
}

export function updateReceivingPauses(env: Env, seller: Seller, input: SaveReceivingPause, now = Date.now()) {
  const { storage, shop } = env;
  if (shop.status !== "active") throw new ApiError("FORBIDDEN", "Магазин приостановлен администратором");
  assertRevision(storage, "pause", input.expectedRevision);
  const settings = resolveFulfillment(readSetting(storage, "fulfillment"), true);
  const pauses = { delivery: activePause(settings, "delivery", now), pickup: activePause(settings, "pickup", now) };
  if (input.methods.some((method) => !settings[method] && !pauses[method]))
    throw new ApiError("VALIDATION", "Способ получения не настроен");
  const pause =
    input.action === "pause"
      ? {
          term: input.term,
          until: pauseDeadline(input.term, now, timeZone(storage)),
          startedAt: now,
          showBanner: input.showBanner,
          message: input.showBanner ? input.message : "",
        }
      : undefined;
  for (const method of input.methods) pauses[method] = pause;
  storeSetting(storage, "fulfillment", { ...settings, acceptingOrders: true, pauses });
  advanceRevision(storage, "pause", seller, now);
  return readReceivingPauses(env, seller, now);
}
