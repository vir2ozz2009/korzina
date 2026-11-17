import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { settings } from "../../shop/schema";
import { deleteMediaObjects } from "./objects";
import { media, mediaUsage } from "./schema";

export async function scheduleMediaCleanup(storage: DurableObjectStorage) {
  const db = drizzle(storage);
  if (!db.select({ id: media.id }).from(media).where(isNotNull(media.expiresAt)).limit(1).get()) {
    await storage.deleteAlarm();
    return;
  }
  const next = Date.now() + 86_400_000;
  const existing = await storage.getAlarm();
  if (existing === null || existing > next) await storage.setAlarm(next);
}
export async function cleanupMedia(
  storage: DurableObjectStorage,
  env: Pick<Env, "MEDIA" | "MEDIA_PUBLIC">,
  now = Date.now(),
) {
  const db = drizzle(storage);
  const shop = db.select().from(settings).where(eq(settings.key, "shop_id")).get();
  if (!shop) return;
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
  // Only stores with expiring files have an alarm. Attached files cause no background work.
  if (db.select({ id: media.id }).from(media).where(isNotNull(media.expiresAt)).limit(1).get())
    await storage.setAlarm(now + (expired.length === 50 ? 1000 : 86_400_000));
}
