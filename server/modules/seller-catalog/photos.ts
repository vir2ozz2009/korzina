import type { SellerPhotoInput } from "../../../src/shared/contracts/seller-catalog";
import { ApiError } from "../../../src/shared/errors";
import { day } from "../../shop/cleanup";

export function attachCatalogPhoto(storage: DurableObjectStorage, accountId: string, photo: SellerPhotoInput) {
  const media = storage.sql
    .exec<{ owner: string; status: string }>(
      "SELECT owner,status FROM media WHERE id=? AND purpose='product' AND ready=1 AND (expires_at IS NULL OR expires_at>?)",
      photo.id,
      Date.now(),
    )
    .toArray()[0];
  if (!media || (media.status !== "attached" && (media.status !== "temp" || media.owner !== `seller:${accountId}`)))
    throw new ApiError("VALIDATION", "Фото недоступно", { field: "photos" });
  storage.sql.exec(
    "UPDATE media SET status='attached',expires_at=NULL,crop_position=coalesce(?,crop_position) WHERE id=?",
    photo.cropPosition ? JSON.stringify(photo.cropPosition) : null,
    photo.id,
  );
}

export function catalogPhotoIds(storage: DurableObjectStorage, productId: string) {
  return storage.sql
    .exec<{ id: string }>(
      `SELECT media_id AS id FROM product_photos WHERE product_id=?
    UNION SELECT photo_id FROM variants WHERE product_id=? AND photo_id IS NOT NULL`,
      productId,
      productId,
    )
    .toArray()
    .map((row) => row.id);
}

export function retireUnusedPhotos(storage: DurableObjectStorage, ids: string[], productId?: string) {
  if (!ids.length) return;
  storage.sql.exec(
    `UPDATE media SET expires_at=? WHERE id IN (SELECT value FROM json_each(?))
    AND status='attached'
    AND NOT EXISTS(SELECT 1 FROM product_photos WHERE media_id=media.id)
    AND NOT EXISTS(SELECT 1 FROM variants WHERE photo_id=media.id)
    AND NOT EXISTS(SELECT 1 FROM categories WHERE photo_id=media.id)
    AND NOT EXISTS(SELECT 1 FROM brands WHERE photo_id=media.id)
    AND NOT EXISTS(
      SELECT 1 FROM orders o JOIN json_each(o.snapshot,'$.lines') line
      WHERE json_extract(line.value,'$.productId')=?
        OR instr(json_extract(line.value,'$.image.original.src'),'/' || media.id || '/')>0
    )`,
    Date.now() + 30 * day,
    JSON.stringify(ids),
    productId ?? null,
  );
}
