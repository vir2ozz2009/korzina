import { and, eq, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { settings } from "../../shop/schema";
import { deleteMediaObjects } from "./objects";
import { media, mediaUsage } from "./schema";

export { scheduleCleanup as scheduleMediaCleanup } from "../../shop/cleanup";
export async function cleanupMedia(
  storage: DurableObjectStorage,
  env: Pick<Env, "MEDIA" | "MEDIA_PUBLIC">,
  now = Date.now(),
) {
  const db = drizzle(storage);
  const shop = db.select().from(settings).where(eq(settings.key, "shop_id")).get();
  if (!shop) return false;
  const expired = db.select().from(media).where(lte(media.expiresAt, now)).orderBy(media.expiresAt).limit(50).all();
  for (const record of expired) {
    await deleteMediaObjects(env, shop.value, record.id);
    storage.transactionSync(() => {
      db.delete(media)
        .where(and(eq(media.id, record.id), lte(media.expiresAt, now)))
        .run();
      db.update(mediaUsage)
        .set({ bytes: sql`${mediaUsage.bytes} - ${record.bytes}` })
        .where(eq(mediaUsage.id, 1))
        .run();
    });
  }
  return expired.length === 50;
}
