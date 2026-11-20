import { sql } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { normalizeTheme } from "../../src/shared/theme-presets";
import { shopTimeZoneSql } from "./time-zone";

export function readPublicSettings(db: DrizzleSqliteDODatabase) {
  const row = db.get<{ name: string | null; theme: string | null; timeZone: string }>(sql`
    SELECT (SELECT value FROM settings WHERE key='display_name') AS name,
      (SELECT value FROM settings WHERE key='theme') AS theme,
      ${sql.raw(shopTimeZoneSql)} AS timeZone
  `);
  let theme: unknown;
  try {
    theme = JSON.parse(row.theme ?? "null");
  } catch {
    theme = null;
  }
  return { name: row.name, theme: normalizeTheme(theme), timeZone: row.timeZone };
}
