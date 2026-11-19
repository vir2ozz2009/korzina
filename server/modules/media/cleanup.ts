import { deleteMediaObjects } from "./objects";

export { scheduleCleanup as scheduleMediaCleanup } from "../../shop/cleanup";

const batchSize = 50;

export async function cleanupMedia(
  storage: DurableObjectStorage,
  env: Pick<Env, "MEDIA" | "MEDIA_PUBLIC">,
  now = Date.now(),
) {
  const expired = storage.sql
    .exec<{ shop: string; id: string }>(
      `SELECT settings.value AS shop, media.id FROM media
       JOIN settings ON settings.key='shop_id'
       WHERE media.expires_at<=? ORDER BY media.expires_at LIMIT ?`,
      now,
      batchSize,
    )
    .toArray();
  if (!expired.length) return { processed: false, more: false };

  const removedObjects: string[] = [];
  try {
    for (const { shop, id } of expired) {
      await deleteMediaObjects(env, shop, id);
      removedObjects.push(id);
    }
  } finally {
    if (removedObjects.length) removeExpiredMediaRows(storage, removedObjects, now);
  }
  return { processed: true, more: expired.length === batchSize };
}

function removeExpiredMediaRows(storage: DurableObjectStorage, ids: string[], now: number) {
  storage.transactionSync(() => {
    const removed = storage.sql
      .exec<{ bytes: number }>(
        "DELETE FROM media WHERE id IN (SELECT value FROM json_each(?)) AND expires_at<=? RETURNING bytes",
        JSON.stringify(ids),
        now,
      )
      .toArray();
    const bytes = removed.reduce((sum, row) => sum + row.bytes, 0);
    storage.sql.exec("UPDATE media_usage SET bytes=bytes-? WHERE id=1", bytes);
  });
}
