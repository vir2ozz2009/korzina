import { exports } from "cloudflare:workers";

export async function applyDemoSeed(database: D1Database, environment: string | undefined, shopId: string) {
  if (environment !== "demo" && environment !== "preview") return;
  const pending = await database
    .prepare("SELECT requested_at FROM demo_seed_queue WHERE shop_id=?")
    .bind(shopId)
    .first<{ requested_at: string }>();
  if (!pending) return;
  await exports.Shop.get(exports.Shop.idFromName(shopId)).seedDemoCatalog(shopId);
  await database
    .prepare("DELETE FROM demo_seed_queue WHERE shop_id=? AND requested_at=?")
    .bind(shopId, pending.requested_at)
    .run();
}
