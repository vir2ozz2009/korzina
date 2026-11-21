import { sql } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { StoreProfile } from "../../src/shared/contracts/seller-shop-profile";
import { normalizeTheme } from "../../src/shared/theme-presets";
import { shopTimeZoneSql } from "./time-zone";

type SettingsProfile = Omit<StoreProfile, "name" | "timeZone" | "logo"> & {
  logo: (NonNullable<StoreProfile["logo"]> & { src: string }) | null;
};
export function readPublicSettings(db: DrizzleSqliteDODatabase) {
  const row = db.get<{
    name: string | null;
    theme: string | null;
    timeZone: string;
    profile: string | null;
    fulfillment: string | null;
  }>(sql`
    SELECT (SELECT value FROM settings WHERE key='display_name') AS name,
      (SELECT value FROM settings WHERE key='theme') AS theme,
      (SELECT value FROM settings WHERE key='store_profile') AS profile,
      (SELECT value FROM settings WHERE key='fulfillment') AS fulfillment,
      ${sql.raw(shopTimeZoneSql)} AS timeZone
  `);
  let theme: unknown;
  try {
    theme = JSON.parse(row.theme ?? "null");
  } catch {
    theme = null;
  }
  const profile = row.profile ? (JSON.parse(row.profile) as SettingsProfile) : undefined;
  return {
    name: row.name,
    profile,
    fulfillment: row.fulfillment,
    theme: normalizeTheme(theme),
    timeZone: row.timeZone,
  };
}
