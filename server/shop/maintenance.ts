import { cleanupMedia } from "../modules/media/cleanup";
import { cleanupRecords, rescheduleCleanup } from "./cleanup";

export async function cleanupShop(
  storage: DurableObjectStorage,
  env: Pick<Env, "MEDIA" | "MEDIA_PUBLIC">,
  now = Date.now(),
) {
  const mediaBacklog = await cleanupMedia(storage, env, now);
  const recordsBacklog = cleanupRecords(storage, now);
  await rescheduleCleanup(storage, mediaBacklog || recordsBacklog, now);
}
