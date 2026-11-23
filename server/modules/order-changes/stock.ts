import type { OrderLine } from "../../../src/shared/contracts/order-changes";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import { multiplyMinor } from "../../../src/shared/money";
import type { ShopEnv } from "../../shop/env";
import { catalogImage } from "../catalog/images";
import { pauseUntil } from "../catalog/sale-pause";

type Shop = ShopEnv["Bindings"];
type OfferRow = {
  variantId: string;
  productId: string;
  name: string;
  unit: string;
  priceMinor: number;
  stock: number | null;
  photoId: string | null;
};

export function replacementOffers(env: Shop, ids: string[]) {
  if (!ids.length) return new Map<string, OfferRow>();
  const rows = env.storage.sql
    .exec<OfferRow>(
      `SELECT v.id AS variantId,p.id AS productId,p.name,v.name AS unit,v.price_minor AS priceMinor,v.stock,
        COALESCE(v.photo_id,(SELECT pp.media_id FROM product_photos pp WHERE pp.product_id=p.id ORDER BY position LIMIT 1)) AS photoId
     FROM variants v JOIN products p ON p.id=v.product_id
     WHERE v.id IN (SELECT value FROM json_each(?)) AND v.visible=1
       AND v.product_available=1 AND v.product_paused=0 AND v.sale_pause IS NULL`,
      JSON.stringify(ids),
    )
    .toArray();
  return new Map(rows.map((row) => [row.variantId, row]));
}

export function replacementLine(env: Shop, offer: OfferRow | undefined, quantity: number, lineId?: string): OrderLine {
  if (!offer || (offer.stock !== null && offer.stock < quantity))
    throw new ApiError("STOCK_CHANGED", "Этого количества больше нет", { available: offer?.stock ?? 0 });
  const { photoId, stock: _stock, ...line } = offer;
  const image = photoId ? catalogImage(photoId, env.shop.id, env.media.MEDIA_PUBLIC_URL) : undefined;
  return { ...line, lineId, quantity, totalMinor: multiplyMinor(line.priceMinor, quantity), image };
}

export function reserveReplacement(env: Shop, line: OrderLine) {
  const updated = env.storage.sql
    .exec<{ stock: number | null }>(
      `UPDATE variants SET stock=stock-?,stock_revision=stock_revision+(stock IS NOT NULL),purchased=purchased+(CASE WHEN stock IS NULL THEN 0 ELSE ? END)
      WHERE id=? AND (stock IS NULL OR stock>=?) RETURNING stock`,
      line.quantity,
      line.quantity,
      line.variantId,
      line.quantity,
    )
    .toArray()[0];
  if (!updated) throw new ApiError("STOCK_CHANGED", "Этого количества больше нет");
  return updated.stock !== null;
}

export function pauseMissingProducts(env: Pick<Shop, "storage" | "timeZone">, ids: string[], now: number) {
  if (!ids.length) return false;
  const until = pauseUntil("tomorrow", now, env.timeZone ?? defaultShopTimeZone);
  return (
    env.storage.sql.exec(
      `UPDATE products SET sale_pause=?,revision=revision+1
     WHERE id IN (SELECT value FROM json_each(?))
       AND (sale_pause IS NULL OR (sale_pause>0 AND sale_pause<?))`,
      until,
      JSON.stringify(ids),
      until,
    ).rowsWritten > 0
  );
}
