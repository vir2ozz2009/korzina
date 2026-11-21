import { fulfillmentSettingsInput } from "../../../src/shared/contracts/receiving";
import { type MethodSchedule, weekdays } from "../../../src/shared/contracts/receiving-time";
import type {
  ReceivingHours,
  SaveReceivingHours,
  SaveReceivingPause,
  SaveReceivingSettings,
} from "../../../src/shared/contracts/seller-receiving";
import { ApiError } from "../../../src/shared/errors";
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
  const { delivery, pickup, requiredDetails } = settings;
  return {
    ...revision(storage, "receiving"),
    canWrite: seller.role === "owner",
    maps: features.maps,
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
  const fallback = resolveFulfillment(saved, env.features.maps);
  if (!env.features.maps && input.delivery?.mode === "map")
    throw new ApiError("FEATURE_DISABLED", "Карта отключена. Проверьте условия доставки.");
  const delivery =
    existing.delivery?.mode === "map" &&
    !env.features.maps &&
    input.delivery?.mode === "text" &&
    JSON.stringify(input.delivery) === JSON.stringify(fallback.delivery)
      ? existing.delivery
      : input.delivery;
  storeSetting(storage, "fulfillment", fulfillmentSettingsInput.parse({ ...existing, ...input, delivery }));
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
  return {
    ...revision(env.storage, "hours"),
    canWrite: seller.role === "owner",
    settings: form ? (JSON.parse(form) as Omit<SaveReceivingHours, "expectedRevision">) : null,
    schedule: readSchedule(env.storage),
  };
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clockTime = (time: number) =>
  `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;

export function scheduleFromHours(input: ReceivingHours, closedDates: string[]): MethodSchedule {
  const { days, interval, capacity, dayCapacity, preparationMinutes, dayCutoff } = input;
  const mode = interval === "after_order" ? "after_order" : interval === "day" ? "day" : "slots";
  const step = mode === "slots" ? Number(interval) * 60 : 1440;
  return {
    mode,
    dayCapacity,
    preparationMinutes,
    dayCutoff,
    closedDates,
    cutoffForSlots: true,
    days: Object.fromEntries(
      weekdays.map((day) => [
        day,
        (days[day] ?? [])
          .toSorted((a, b) => a.start.localeCompare(b.start))
          .flatMap(({ start, end }) => {
            const from = minutes(start);
            const to = minutes(end);
            return Array.from({ length: Math.ceil((to - from) / step) }, (_, index) => ({
              start: clockTime(from + index * step),
              end: clockTime(Math.min(to, from + (index + 1) * step)),
              capacity,
            }));
          }),
      ]),
    ),
  };
}

function timeZone(storage: DurableObjectStorage) {
  return storage.sql.exec<{ timeZone: string }>(`SELECT ${shopTimeZoneSql} AS timeZone`).one().timeZone;
}

export function updateReceivingHours(env: Env, seller: Seller, { expectedRevision, ...input }: SaveReceivingHours) {
  const { storage } = env;
  assertRevision(storage, "hours", expectedRevision);
  const { delivery, pickup, closedDates } = input;
  storeSetting(storage, "receiving_schedule", {
    timeZone: timeZone(storage),
    delivery: scheduleFromHours(delivery, closedDates),
    pickup: scheduleFromHours(pickup ?? delivery, closedDates),
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
