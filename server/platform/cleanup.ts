import { exports } from "cloudflare:workers";
import { day } from "../shop/cleanup";

export const platformCleanupId = "korzina-platform-maintenance";
export async function scheduleSellerCleanup() {
  await exports.Shop.get(exports.Shop.idFromName(platformCleanupId)).schedulePlatformCleanup();
}

const retention = [
  { table: "seller_sessions", column: "expires_at", keep: 0 },
  { table: "admin_sessions", column: "expires_at", keep: 0 },
  { table: "seller_exchanges", column: "expires_at", keep: 0 },
  { table: "platform_commands", column: "created_at", keep: day },
  { table: "platform_audit", column: "created_at", keep: 365 * day },
  { table: "platform_order_events", column: "created_at", keep: 31 * day },
  { table: "invitations", column: "expires_at", keep: 30 * day },
] as const;
const batchSize = 100;

// The coordinator only runs while there are expired records or a known next deadline.
export async function cleanupSellers(database: D1Database, storage: DurableObjectStorage, now = Date.now()) {
  const results = await database.batch(
    retention.map(({ table, column, keep }) =>
      database
        .prepare(`DELETE FROM ${table} WHERE rowid IN (
      SELECT rowid FROM ${table} WHERE ${column}<=? ORDER BY ${column} LIMIT ${batchSize}
    )`)
        .bind(now - keep),
    ),
  );
  if (results.some(({ meta }) => meta.changes === batchSize)) return storage.setAlarm(now + 1000);
  const deadlines = retention
    .map(({ table, column, keep }) => `(SELECT MIN(${column})+${keep} FROM ${table}) AS ${table}`)
    .join(", ");
  const result = await database.prepare(`SELECT ${deadlines}`).first<Record<string, number | null>>();
  const next = Math.min(...Object.values(result ?? {}).filter((value) => value !== null));
  if (!Number.isFinite(next)) await storage.deleteAlarm();
  else await storage.setAlarm(Math.max(now + 1000, Math.min(next, now + day)));
}
