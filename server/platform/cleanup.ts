import { exports } from "cloudflare:workers";
import { day } from "../shop/cleanup";

export const platformCleanupId = "korzina-platform-maintenance";
export async function scheduleSellerCleanup() {
  await exports.Shop.get(exports.Shop.idFromName(platformCleanupId)).schedulePlatformCleanup();
}
// One coordinator rather than repeating platform cleanup in every shop's alarm.
export async function cleanupSellers(database: D1Database, storage: DurableObjectStorage, now = Date.now()) {
  const result = await database
    .prepare(`DELETE FROM seller_sessions WHERE token_hash IN (
    SELECT token_hash FROM seller_sessions WHERE expires_at<=? ORDER BY expires_at LIMIT 100)`)
    .bind(now)
    .run();
  if (result.meta.changes === 100) return storage.setAlarm(now + 1000);
  const next = await database
    .prepare("SELECT MIN(expires_at) AS due FROM seller_sessions")
    .first<{ due: number | null }>();
  if (next?.due == null) await storage.deleteAlarm();
  else await storage.setAlarm(Math.max(now + 1000, Math.min(next.due, now + day)));
}
