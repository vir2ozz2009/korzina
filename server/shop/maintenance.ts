import { cleanupMedia } from "../modules/media/cleanup";
import { cleanupRecords, rescheduleCleanup } from "./cleanup";
import { publishPlatformOrders } from "./order-projection";

export async function cleanupShop(
  storage: DurableObjectStorage,
  env: Pick<Env, "MEDIA" | "MEDIA_PUBLIC"> & Partial<Pick<Env, "PLATFORM">>,
  now = Date.now(),
) {
  const pendingOrders = await publishPlatformOrders(storage, env.PLATFORM);
  const media = await cleanupMedia(storage, env, now);
  // Reserve one SQL each for selecting due tables and scheduling the next alarm.
  const recordsBacklog = cleanupRecords(storage, now, media.processed ? 2 : 4);
  await rescheduleCleanup(storage, pendingOrders || media.more || recordsBacklog, now);
}
