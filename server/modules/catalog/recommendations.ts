import type { CatalogOffer, CatalogTile } from "../../../src/shared/contracts/catalog";
import { documentImage } from "./images";
import { mediaJsonSql } from "./queries";

const relatedSql = `SELECT p.id,p.name,p.category_id AS categoryId,p.brand_id AS brandId,
  (SELECT ${mediaJsonSql} FROM product_photos pp JOIN media m ON m.id=pp.media_id
    WHERE pp.product_id=p.id AND m.ready=1 AND m.status='attached' ORDER BY pp.position LIMIT 1) AS photo,
  (SELECT json_group_array(json_object('id',v.id,'name',v.name,'photoId',v.photo_id,
    'priceMinor',v.price_minor,'oldPriceMinor',v.old_price_minor,'stock',v.stock))
    FROM (SELECT * FROM variants WHERE product_id=p.id AND visible=1 AND (stock IS NULL OR stock>0)
      ORDER BY position,id) v) AS variants
  FROM products p WHERE p.published=1 AND p.visible=1 AND p.category_id=? AND p.id<>?
    AND EXISTS(SELECT 1 FROM variants WHERE product_id=p.id AND visible=1 AND (stock IS NULL OR stock>0))
  ORDER BY p.id LIMIT 4`;

export function readRecommendations(storage: DurableObjectStorage, category: string, product: string, shopId: string) {
  const items: CatalogTile[] = [];
  const offers: CatalogOffer[] = [];
  for (const row of storage.sql.exec<{
    id: string;
    name: string;
    categoryId: string;
    brandId: string | null;
    photo: string | null;
    variants: string;
  }>(relatedSql, category, product)) {
    const variants = JSON.parse(row.variants) as (CatalogTile["variants"][number] &
      Pick<CatalogOffer, "priceMinor" | "oldPriceMinor" | "stock">)[];
    items.push({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      brandId: row.brandId,
      image: documentImage(row.photo, shopId),
      variants: variants.map(({ id, name, photoId }) => ({ id, name, photoId })),
    });
    for (const { id, priceMinor, oldPriceMinor, stock } of variants) {
      offers.push({ id, priceMinor, oldPriceMinor, stock, productId: row.id, available: true, visible: true });
    }
  }
  return { items, offers };
}
