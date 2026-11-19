import { exports } from "cloudflare:workers";
import { day } from "../shop/cleanup";

export const platformCleanupId = "korzina-platform-maintenance";
export async function scheduleSellerCleanup() {
  await exports.Shop.get(exports.Shop.idFromName(platformCleanupId)).schedulePlatformCleanup();
}
// One coordinator rather than repeating platform cleanup in every shop's alarm.
export async function cleanupSellers(database: D1Database, storage: DurableObjectStorage, now = Date.now()) {
  const results = await database.batch([
    database
      .prepare(`DELETE FROM seller_sessions WHERE token_hash IN (
      SELECT token_hash FROM seller_sessions WHERE expires_at<=? ORDER BY expires_at LIMIT 100)`)
      .bind(now),
    database
      .prepare(`DELETE FROM admin_sessions WHERE token_hash IN (
      SELECT token_hash FROM admin_sessions WHERE expires_at<=? ORDER BY expires_at LIMIT 100)`)
      .bind(now),
    database
      .prepare(`DELETE FROM seller_exchanges WHERE id IN (
      SELECT id FROM seller_exchanges WHERE expires_at<=? ORDER BY expires_at LIMIT 100)`)
      .bind(now),
  ]);
  if (results.some(({ meta }) => meta.changes === 100)) return storage.setAlarm(now + 1000);
  const next = await database
    .prepare(`SELECT MIN(due) AS due FROM (SELECT MIN(expires_at) AS due FROM seller_sessions
      UNION ALL SELECT MIN(expires_at) AS due FROM seller_exchanges
      UNION ALL SELECT MIN(expires_at) AS due FROM admin_sessions)`)
    .first<{ due: number | null }>();
  if (next?.due == null) await storage.deleteAlarm();
  else await storage.setAlarm(Math.max(now + 1000, Math.min(next.due, now + day)));
}
