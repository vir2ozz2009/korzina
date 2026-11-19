import { and, eq, sql } from "drizzle-orm";
import { type MediaPurpose, type PhotoMetadata, publicPurposes } from "../../../src/shared/contracts/media";
import { ApiError } from "../../../src/shared/errors";
import type { ShopEnv } from "../../shop/env";
import { assertUpload, type MediaActor } from "./access";
import { scheduleMediaCleanup } from "./cleanup";
import { detectContent } from "./content";
import { processImage } from "./images";
import { stripWebpMetadata } from "./metadata";
import { deleteMediaObjects, mediaPrefix } from "./objects";
import { type MediaRecord, media, mediaUsage } from "./schema";

type MediaEnv = ShopEnv["Bindings"];
export async function storageUsage(env: MediaEnv) {
  const configured = await env.platform
    .prepare("SELECT value FROM platform_settings WHERE key = ?")
    .bind("media_limit_bytes")
    .first<{ value: string }>();
  const parsed = Number(configured?.value ?? 2 * 1024 ** 3);
  const limit = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 2 * 1024 ** 3;
  return { used: env.db.select().from(mediaUsage).where(eq(mediaUsage.id, 1)).get()?.bytes ?? 0, limit };
}
export function findMedia(env: MediaEnv, id: string) {
  const record = env.db.select().from(media).where(eq(media.id, id)).get();
  if (!record) throw new ApiError("NOT_FOUND", "Файл не найден");
  return record;
}
export async function uploadMedia(
  env: MediaEnv,
  actor: MediaActor,
  purpose: MediaPurpose,
  bytes: Uint8Array,
  key: string,
  fingerprint: string,
  metadata: PhotoMetadata = {},
): Promise<MediaRecord> {
  const mime = detectContent(bytes);
  assertUpload(actor, purpose, mime);
  const { limit } = await storageUsage(env);
  const record = env.storage.transactionSync(() => {
    const previous = env.db
      .select()
      .from(media)
      .where(and(eq(media.owner, actor.id), eq(media.requestKey, key)))
      .get();
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new ApiError("IDEMPOTENCY_CONFLICT", "Ключ уже использован с другим файлом");
      if (!previous.ready) throw new ApiError("VERSION_CONFLICT", "Файл ещё обрабатывается. Повторите запрос");
      return previous;
    }
    env.db.insert(mediaUsage).values({ id: 1, bytes: 0 }).onConflictDoNothing().run();
    const used = env.db.select().from(mediaUsage).where(eq(mediaUsage.id, 1)).get()?.bytes ?? 0;
    if (used + bytes.length > limit)
      throw new ApiError("STORAGE_LIMIT", "В хранилище магазина нет места. Удалите ненужные файлы или увеличьте лимит");
    const reserved: MediaRecord = {
      id: crypto.randomUUID(),
      edgeColor: metadata.edgeColor ?? null,
      contentBox: metadata.contentBox ?? null,
      cropPosition: null,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      owner: actor.id,
      purpose,
      status: "temp",
      ready: false,
      bytes: bytes.length,
      mime,
      requestKey: key,
      fingerprint,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    };
    env.db.insert(media).values(reserved).run();
    env.db
      .update(mediaUsage)
      .set({ bytes: used + bytes.length })
      .where(eq(mediaUsage.id, 1))
      .run();
    return reserved;
  });
  if (record.ready) return record;
  try {
    await scheduleMediaCleanup(env.storage);
    const renditions =
      mime === "application/pdf"
        ? [{ name: "original.pdf", bytes, mime }]
        : await processImage(env.media.IMAGES, bytes, purpose);
    for (const rendition of renditions)
      if (rendition.mime === "image/webp") rendition.bytes = stripWebpMetadata(rendition.bytes);
    const size = renditions.reduce((total, file) => total + file.bytes.length, 0);
    for (const file of renditions) {
      const target = publicPurposes.includes(purpose) ? env.media.MEDIA_PUBLIC : env.media.MEDIA;
      await target.put(mediaPrefix(env.shop.id, record.id) + file.name, file.bytes, {
        httpMetadata: {
          contentType: file.mime,
          cacheControl: publicPurposes.includes(purpose) ? "public, max-age=31536000, immutable" : "private, no-store",
        },
      });
    }
    return env.storage.transactionSync(() => {
      const used = env.db.select().from(mediaUsage).where(eq(mediaUsage.id, 1)).get()?.bytes ?? 0;
      if (used - record.bytes + size > limit)
        throw new ApiError("STORAGE_LIMIT", "В хранилище магазина нет места для обработанного фото");
      env.db
        .update(mediaUsage)
        .set({ bytes: used - record.bytes + size })
        .where(eq(mediaUsage.id, 1))
        .run();
      env.db
        .update(media)
        .set({ ready: true, bytes: size, mime: renditions[0].mime })
        .where(eq(media.id, record.id))
        .run();
      return findMedia(env, record.id);
    });
  } catch (error) {
    await deleteMediaObjects(env.media, env.shop.id, record.id);
    env.storage.transactionSync(() => {
      env.db.delete(media).where(eq(media.id, record.id)).run();
      env.db
        .update(mediaUsage)
        .set({ bytes: sql`${mediaUsage.bytes} - ${record.bytes}` })
        .where(eq(mediaUsage.id, 1))
        .run();
    });
    throw error;
  }
}
