import { sql } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { StoreProfile } from "../../src/shared/contracts/seller-shop-profile";
import { normalizeTheme } from "../../src/shared/theme-presets";
import { shopTimeZoneSql } from "./time-zone";

type SettingsProfile = Omit<StoreProfile, "name" | "timeZone" | "logo"> & {
  logo: (NonNullable<StoreProfile["logo"]> & { src: string }) | null;
};
export function readPublicSettings(db: DrizzleSqliteDODatabase) {
  const row = db.get<{ name: string | null; theme: string | null; timeZone: string; profile: string | null }>(sql`
    SELECT (SELECT value FROM settings WHERE key='display_name') AS name,
      (SELECT value FROM settings WHERE key='theme') AS theme,
      (SELECT value FROM settings WHERE key='store_profile') AS profile,
      ${sql.raw(shopTimeZoneSql)} AS timeZone
  `);
  let theme: unknown;
  try {
    theme = JSON.parse(row.theme ?? "null");
  } catch {
    theme = null;
  }
  const profile = row.profile ? (JSON.parse(row.profile) as SettingsProfile) : { logo: null };
  return { name: row.name, profile, theme: normalizeTheme(theme), timeZone: row.timeZone };
}
