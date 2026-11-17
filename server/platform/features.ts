import { type FeatureState, resolveFeatures } from "../../src/shared/flags.ts";
import type { SqlStatement } from "./create-shop.ts";

export const featureQuery = "SELECT key, enabled FROM feature_overrides WHERE shop_id = ?";

export async function readFeatures(database: D1Database, shopId: string): Promise<FeatureState> {
  // F6: only the Worker context caches this public snapshot, for at most 30 seconds.
  const rows = await database
    .withSession("first-primary")
    .prepare(featureQuery)
    .bind(shopId)
    .all<{ key: string; enabled: number }>();
  return resolveFeatures(rows.results.map((row) => ({ key: row.key, enabled: row.enabled === 1 })));
}

export function featureStatement(slug: string, key: string, enabled: boolean): SqlStatement {
  return {
    sql: `INSERT INTO feature_overrides (shop_id, key, enabled)
      SELECT id, ?, ? FROM shops WHERE slug = ?
      ON CONFLICT(shop_id, key) DO UPDATE SET enabled = excluded.enabled
      WHERE feature_overrides.enabled != excluded.enabled`,
    params: [key, enabled ? 1 : 0, slug],
  };
}
