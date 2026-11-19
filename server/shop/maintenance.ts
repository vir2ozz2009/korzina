import { cleanupMedia } from "../modules/media/cleanup";
import { cleanupRecords, rescheduleCleanup } from "./cleanup";

export async function cleanupShop(
  storage: DurableObjectStorage,
  env: Pick<Env, "MEDIA" | "MEDIA_PUBLIC">,
  now = Date.now(),
) {
  const media = await cleanupMedia(storage, env, now);
  // Reserve one SQL each for selecting due tables and scheduling the next alarm.
  const recordsBacklog = cleanupRecords(storage, now, media.processed ? 2 : 4);
  await rescheduleCleanup(storage, media.more || recordsBacklog, now);
}
