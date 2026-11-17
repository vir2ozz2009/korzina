import { inArray } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { normalizeTheme } from "../../src/shared/theme-presets";
import { settings } from "./schema";

export function readPublicSettings(db: DrizzleSqliteDODatabase) {
  const rows = db
    .select()
    .from(settings)
    .where(inArray(settings.key, ["display_name", "theme"]))
    .all();
  const values = new Map(rows.map((row) => [row.key, row.value]));
  let theme: unknown;
  try {
    theme = JSON.parse(values.get("theme") ?? "null");
  } catch {
    theme = null;
  }
  return { name: values.get("display_name"), theme: normalizeTheme(theme) };
}
