import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { cropPositionContract, mediaPurpose, photoMetadataContract } from "../../../src/shared/contracts/media";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { handleError } from "../../middleware/errors";
import { digest } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { assertRead, type MediaActor, mediaActor } from "./access";
import { scheduleMediaCleanup } from "./cleanup";
import { readUpload } from "./content";
import { mediaPrefix } from "./objects";
import { presentMedia } from "./presentation";
import { publicMediaOrigin } from "./public-origin";
import { media } from "./schema";
import { findMedia, storageUsage, uploadMedia } from "./service";
import { signMedia, verifyMedia } from "./signing";

type MediaRouterEnv = ShopEnv & { Variables: ShopEnv["Variables"] & { actor: MediaActor } };
export const mediaRoutes = new Hono<MediaRouterEnv>()
  .onError(handleError)
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.set("actor", await mediaActor(c.env, c.req.raw));
    await next();
  })
  .get("/usage", async (c) => {
    if (!c.get("actor").seller) throw new ApiError("FORBIDDEN", "Войдите в кабинет");
    return c.json(await storageUsage(c.env));
  })
  .post("/upload", async (c) => {
    const parsed = mediaPurpose.safeParse(c.req.query("purpose"));
    if (!parsed.success) throw new ApiError("VALIDATION", "Укажите назначение файла");
    const key = c.req.header("Idempotency-Key");
    if (!key || !/^[\x21-\x7e]{1,128}$/.test(key)) throw new ApiError("VALIDATION", "Нужен Idempotency-Key");
    if (
      (c.req.header("Origin") && c.req.header("Origin") !== new URL(c.req.url).origin) ||
      c.req.header("Sec-Fetch-Site") === "cross-site"
    )
      throw new ApiError("FORBIDDEN", "Запрос с другого сайта запрещён");
    const rawMetadata = c.req.header("X-Photo-Metadata");
    let metadata = {};
    try {
      metadata = photoMetadataContract.parse(rawMetadata ? JSON.parse(rawMetadata) : {});
    } catch {
      throw new ApiError("VALIDATION", "Неверные метаданные фото");
    }
    const bytes = await readUpload(c.req.raw, parsed.data === "payment_qr");
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const fingerprint = await digest(`${parsed.data}:${Array.from(hash).join(",")}:${JSON.stringify(metadata)}`);
    const record = await uploadMedia(
      c.env,
      c.get("actor"),
      parsed.data,
      bytes,
      await digest(key),
      fingerprint,
      metadata,
    );
    return c.json(presentMedia(record, c.env.shop.id, publicMediaOrigin(c.req.raw, c.env.media.MEDIA_PUBLIC_URL)), 201);
  })
  .get("/:id/link", async (c) => {
    const record = findMedia(c.env, c.req.param("id"));
    const actor = c.get("actor");
    assertRead(actor, record);
    const expires = Date.now() + 300_000;
    const sig = await signMedia(c.env.secrets.MEDIA_SIGNING_KEY, c.env.shop.id, record.id, actor.id, expires);
    const url = new URL(c.req.url);
    url.pathname = `/api/media/${record.id}/file`;
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("sig", sig);
    return c.json({ url: url.toString(), expires });
  })
  .get("/:id/file", async (c) => {
    const record = findMedia(c.env, c.req.param("id"));
    const actor = c.get("actor");
    assertRead(actor, record);
    await verifyMedia(
      c.env.secrets.MEDIA_SIGNING_KEY,
      c.env.shop.id,
      record.id,
      actor.id,
      Number(c.req.query("expires")),
      c.req.query("sig") ?? "",
    );
    const object = await c.env.media.MEDIA.get(
      mediaPrefix(c.env.shop.id, record.id) + (record.mime === "application/pdf" ? "original.pdf" : "original.webp"),
    );
    if (!object) throw new ApiError("NOT_FOUND", "Файл не найден");
    c.header("Content-Type", record.mime);
    c.header(
      "Content-Disposition",
      `attachment; filename="${record.id}.${record.mime === "application/pdf" ? "pdf" : "webp"}"`,
    );
    return c.body(object.body);
  })
  .post(
    "/:id/state",
    authBodyLimit,
    authCommand,
    zValidator(
      "json",
      z.discriminatedUnion("action", [
        z.strictObject({ action: z.literal("attach"), cropPosition: cropPositionContract.optional() }),
        z.strictObject({ action: z.literal("delete") }),
      ]),
      validationFailure,
    ),
    async (c) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const result = executeCommand(c.env.storage, c.env.db, `media:${actor.id}`, c.get("command"), () => {
        const record = findMedia(c.env, c.req.param("id"));
        assertRead(actor, record);
        if (record.purpose === "chat" && (input.action === "attach" || record.status === "attached"))
          throw new ApiError("FORBIDDEN", "Фото привязывается к сообщению");
        if (actor.id !== record.owner) throw new ApiError("FORBIDDEN", "Изменять файл может только его владелец");
        if (
          record.purpose === "receipt" &&
          record.status === "attached" &&
          c.env.storage.sql
            .exec(
              "SELECT 1 FROM orders WHERE proof_media_id=? UNION ALL SELECT 1 FROM order_receipt_history WHERE media_id=? LIMIT 1",
              record.id,
              record.id,
            )
            .toArray().length
        )
          throw new ApiError("FORBIDDEN", "Чек уже используется в заказе");
        const cropPosition = input.action === "attach" ? input.cropPosition : undefined;
        if (cropPosition && record.purpose !== "product")
          throw new ApiError("VALIDATION", "Кадр настраивается для фото товара или категории");
        const status = input.action === "attach" ? "attached" : "deleted";
        c.env.db
          .update(media)
          .set({
            status,
            cropPosition,
            expiresAt: input.action === "delete" ? Date.now() + 30 * 86_400_000 : null,
          })
          .where(eq(media.id, record.id))
          .run();
        if (
          record.purpose === "product" &&
          (status !== record.status ||
            (cropPosition && (cropPosition.x !== record.cropPosition?.x || cropPosition.y !== record.cropPosition?.y)))
        )
          c.env.storage.sql.exec("UPDATE catalog_state SET version=version+1 WHERE id=1");
        return {
          body: presentMedia(
            findMedia(c.env, record.id),
            c.env.shop.id,
            publicMediaOrigin(c.req.raw, c.env.media.MEDIA_PUBLIC_URL),
          ),
          status: 200,
        };
      });
      await scheduleMediaCleanup(c.env.storage);
      return c.json(result.body);
    },
  );
