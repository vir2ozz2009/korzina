import type { z } from "zod";
import type { PromoPrice, promoListInput } from "../../../src/shared/contracts/promo";

type PricedVariant = Omit<PromoPrice, "image"> & { photoId: string | null };

import { calendarDate, defaultShopTimeZone, shopDateTime } from "../../../src/shared/datetime";

export function listPromoPrices(
  storage: DurableObjectStorage,
  input: z.infer<typeof promoListInput>,
  zone = defaultShopTimeZone,
  now = Date.now(),
) {
  if (
    (input.kind && input.kind !== "price") ||
    (input.status && input.status !== "active" && input.status !== "scheduled")
  )
    return [];
  const rows = storage.sql
    .exec<Omit<PricedVariant, "status"> & { starts: number | null; ends: number | null }>(
      `SELECT v.id variantId,p.id productId,v.name variantName,p.name productName,v.price_minor priceMinor,v.old_price_minor oldPriceMinor,
     v.promo_starts_at starts,v.promo_ends_at ends,COALESCE(v.photo_id,(SELECT media_id FROM product_photos
       WHERE product_id=p.id ORDER BY position LIMIT 1)) photoId
     FROM variants v JOIN products p ON p.id=v.product_id
     WHERE v.old_price_minor>v.price_minor AND v.visible AND v.product_available
      AND (v.promo_ends_at IS NULL OR v.promo_ends_at>?)
      AND (? IS NULL OR (?='scheduled')=COALESCE(v.promo_starts_at>?,0))
     ORDER BY COALESCE(v.promo_starts_at>?,0),v.promo_starts_at,p.name,v.position,v.id LIMIT 31 OFFSET ?`,
      now,
      input.status ?? null,
      input.status ?? null,
      now,
      now,
      input.offset,
    )
    .toArray();
  return rows.map(
    ({ starts, ends, ...row }): PricedVariant => ({
      ...row,
      status: starts !== null && starts > now ? "scheduled" : "active",
      fromDate: starts === null ? undefined : shopDateTime(starts, zone).date,
      throughDate: ends === null ? undefined : calendarDate(shopDateTime(ends, zone).date, -1),
    }),
  );
}
