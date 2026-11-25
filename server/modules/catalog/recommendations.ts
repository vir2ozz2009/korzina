import type { CatalogOffer, CatalogTile } from "../../../src/shared/contracts/catalog";
import { effectivePrice } from "../promo/cart";
import { documentImage } from "./images";
import { mediaJsonSql } from "./queries";

type Source = {
  id: string;
  categoryId: string;
  recommendations: "auto" | "manual" | "off";
  recommendationIds: string;
  hideOutOfStock: number;
};

export function readRecommendations(storage: DurableObjectStorage, shopId: string, source: Source, promotions = false) {
  const price = effectivePrice("v.", promotions, Date.now());
  const items: CatalogTile[] = [];
  const offers: CatalogOffer[] = [];
  if (source.recommendations === "off" || (source.recommendations === "manual" && source.recommendationIds === "[]"))
    return { items, offers };

  const manual = source.recommendations === "manual";
  for (const row of storage.sql.exec<{
    id: string;
    name: string;
    categoryId: string;
    brandId: string | null;
    photo: string | null;
    variants: string;
  }>(
    `SELECT p.id,p.name,p.category_id AS categoryId,p.brand_id AS brandId,
      (SELECT ${mediaJsonSql} FROM product_photos pp JOIN media m ON m.id=pp.media_id
        WHERE pp.product_id=p.id AND m.ready=1 AND m.status='attached' ORDER BY pp.position LIMIT 1) AS photo,
      (SELECT json_group_array(json_object('id',v.id,'name',v.name,'photoId',v.photo_id,
        'priceMinor',${price.price},'oldPriceMinor',${price.old},'stock',v.stock,
        'available',v.sale_pause IS NULL AND NOT v.product_paused AND (v.stock IS NULL OR v.stock>0)))
        FROM (SELECT * FROM variants WHERE product_id=p.id AND visible=1
          ${!manual || source.hideOutOfStock ? "AND sale_pause IS NULL AND NOT product_paused AND (stock IS NULL OR stock>0)" : ""}
          ORDER BY position,id) v) AS variants
      FROM products p ${manual ? "JOIN json_each(?) r ON p.id=r.value" : ""}
      WHERE p.published=1 AND p.visible=1 AND p.has_catalog_offer=1 AND p.id<>?
      ${!manual ? "AND p.category_id=?" : ""}
      ${!manual || source.hideOutOfStock ? "AND p.available_price IS NOT NULL" : ""}
      ORDER BY ${manual ? "r.key LIMIT 10" : "p.id LIMIT 4"}`,
    ...(manual ? [source.recommendationIds, source.id] : [source.id, source.categoryId]),
  )) {
    const variants = JSON.parse(row.variants) as (CatalogTile["variants"][number] &
      Pick<CatalogOffer, "priceMinor" | "oldPriceMinor" | "stock"> & { available: number })[];
    items.push({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      brandId: row.brandId,
      image: documentImage(row.photo, shopId),
      variants: variants.map(({ id, name, photoId }) => ({ id, name, photoId })),
    });
    for (const { id, priceMinor, oldPriceMinor, stock, available } of variants) {
      offers.push({
        id,
        priceMinor,
        oldPriceMinor,
        stock,
        productId: row.id,
        available: Boolean(available),
        visible: true,
      });
    }
  }
  return { items, offers };
}
