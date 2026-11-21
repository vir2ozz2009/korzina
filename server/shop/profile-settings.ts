import type { StoreProfile } from "../../src/shared/contracts/seller-shop-profile";
import { ApiError } from "../../src/shared/errors";
import { managesSettings, type Seller } from "../auth/roles";
import { pauseUntil } from "../modules/catalog/sale-pause";
import { moveDayPauses } from "../modules/fulfillment/pause";
import { presentMedia } from "../modules/media/presentation";
import { findMedia } from "../modules/media/service";
import type { ShopEnv } from "./env";
import { readPublicSettings } from "./public-settings";
import { shopTimeZoneSql } from "./time-zone";

type Env = ShopEnv["Bindings"];
type Section = "profile" | "theme";
type Revision = { revision: number; author?: string; updatedAt?: number };

function savedRevision(storage: DurableObjectStorage, section: Section): Revision {
  const row = storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key=?", `store_${section}_revision`)
    .toArray()[0];
  return row ? JSON.parse(row.value) : { revision: 0 };
}

export function putSetting(storage: DurableObjectStorage, key: string, value: string) {
  storage.sql.exec(
    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    key,
    value,
  );
}

export function recordStoreRevision(
  storage: DurableObjectStorage,
  section: Section,
  seller?: Seller,
  expected?: number,
) {
  const current = savedRevision(storage, section);
  if (expected !== undefined && expected !== current.revision)
    throw new ApiError("VERSION_CONFLICT", "Настройки изменились", current);
  putSetting(
    storage,
    `store_${section}_revision`,
    JSON.stringify({
      revision: current.revision + 1,
      author: seller?.accountId,
      updatedAt: Date.now(),
    }),
  );
}

export function updateStoreTimeZone(storage: DurableObjectStorage, timeZone: string) {
  const previousTimeZone = storage.sql
    .exec<{ timeZone: string }>(`SELECT ${shopTimeZoneSql} AS timeZone`)
    .one().timeZone;
  if (previousTimeZone === timeZone) return;
  storage.sql.exec(
    `INSERT INTO settings(key,value) VALUES('receiving_schedule',json_object('timeZone',?))
     ON CONFLICT(key) DO UPDATE SET value=json_set(value,'$.timeZone',?)`,
    timeZone,
    timeZone,
  );
  moveDayPauses(storage, timeZone);
  const now = Date.now();
  const until = pauseUntil("tomorrow", now, timeZone);
  storage.sql.exec("UPDATE products SET sale_pause=? WHERE sale_pause>?", until, now);
  storage.sql.exec("UPDATE variants SET sale_pause=? WHERE sale_pause>?", until, now);
}

export function ownerProfile(env: Env, seller: Seller) {
  const { storage, db, shop } = env;
  const values = readPublicSettings(db);
  const { value: country } = storage.sql
    .exec<{ value: string | null }>("SELECT (SELECT value FROM settings WHERE key='phone_region') AS value")
    .one();
  const { currency } = storage.sql.exec<{ currency: string }>("SELECT currency FROM catalog_state WHERE id=1").one();
  return {
    ...savedRevision(storage, "profile"),
    canWrite: managesSettings(seller),
    country,
    currency,
    slug: shop.slug,
    maps: env.features.maps,
    profile: { logo: null, ...values.profile, name: values.name ?? shop.name, timeZone: values.timeZone },
  };
}

export function ownerTheme(env: Env, seller: Seller) {
  return {
    ...savedRevision(env.storage, "theme"),
    canWrite: managesSettings(seller),
    theme: readPublicSettings(env.db).theme,
  };
}

export function writeStoreProfile(
  env: Env,
  seller: Seller,
  { name, logo, timeZone, ...rest }: StoreProfile,
  revision: number,
) {
  const { storage } = env;
  recordStoreRevision(storage, "profile", seller, revision);
  let savedLogo: (NonNullable<StoreProfile["logo"]> & { src: string }) | null = null;
  if (logo) {
    const file = findMedia(env, logo.id);
    if (
      file.purpose !== "logo" ||
      !file.ready ||
      file.status === "deleted" ||
      (file.status === "temp" && (file.owner !== `seller:${seller.accountId}` || (file.expiresAt ?? 0) <= Date.now()))
    )
      throw new ApiError("VALIDATION", "Логотип недоступен");
    const src = presentMedia(file, env.shop.id, env.media.MEDIA_PUBLIC_URL).image?.src;
    if (!src) throw new ApiError("VALIDATION", "Логотип недоступен");
    storage.sql.exec("UPDATE media SET status='attached',expires_at=NULL WHERE id=?", logo.id);
    savedLogo = { ...logo, src };
  }
  putSetting(storage, "display_name", name);
  putSetting(storage, "store_profile", JSON.stringify({ ...rest, logo: savedLogo }));
  const { phone, email, telegram } = rest;
  putSetting(
    storage,
    "shop_contacts",
    JSON.stringify([
      ...(phone ? [{ title: phone, href: `tel:${phone.replace(/[^+\d]/gu, "")}` }] : []),
      ...(email ? [{ title: email, href: `mailto:${email}` }] : []),
      ...(telegram ? [{ title: "Telegram", href: `https://t.me/${telegram.replace(/^@/u, "")}` }] : []),
    ]),
  );
  updateStoreTimeZone(storage, timeZone);
  return ownerProfile(env, seller);
}
