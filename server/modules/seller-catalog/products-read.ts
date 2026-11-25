import type {
  SellerProduct,
  SellerProductQuery,
  SellerProductRow,
  SellerProductStatus,
  SellerVariant,
} from "../../../src/shared/contracts/seller-catalog";
import { ApiError } from "../../../src/shared/errors";
import { documentImage } from "../catalog/images";
import { mediaJsonSql } from "../catalog/queries";
import { uncategorizedId } from "../catalog/sale-pause";

type Row = Omit<SellerProductRow, "image" | "status"> & { image: string | null; status: SellerProductStatus };
const statusSql = `CASE WHEN NOT p.visible OR NOT p.published OR NOT p.has_catalog_offer THEN 'hidden'
 WHEN p.available_price IS NULL THEN 'unavailable' ELSE 'selling' END`;
const filters = {
  all: "1",
  out_of_stock: `(p.sale_pause IS NOT NULL OR NOT EXISTS(SELECT 1 FROM variants v
    WHERE v.product_id=p.id AND v.visible=1 AND v.sale_pause IS NULL AND (v.stock>0 OR v.stock IS NULL)))`,
  low_stock: `p.sale_pause IS NULL AND EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.visible=1
    AND v.sale_pause IS NULL AND v.stock BETWEEN 1 AND 5)`,
  hidden: "(NOT p.visible OR NOT p.published OR NOT p.has_catalog_offer)",
  uncategorized: "p.category_id='__uncategorized__'",
};
const summary = `SELECT p.id,p.name,p.revision,p.sale_pause AS salePause,${statusSql} AS status,
  (SELECT min(v.price_minor) FROM variants v WHERE v.product_id=p.id) AS priceMinor,
  (SELECT count(*) FROM variants v WHERE v.product_id=p.id) AS variantCount,
  (SELECT min(v.stock) FROM variants v WHERE v.product_id=p.id AND v.visible=1 AND v.stock>0) AS stock,
  (SELECT ${mediaJsonSql} FROM product_photos pp JOIN media m ON m.id=pp.media_id
    WHERE pp.product_id=p.id AND m.ready=1 AND m.status='attached' ORDER BY pp.position LIMIT 1) AS image
  FROM products p`;

export function catalogVersion(storage: DurableObjectStorage) {
  return storage.sql
    .exec<{
      version: number;
    }>(`SELECT version+seller_stock_version+coalesce((SELECT max(number) FROM orders),0) AS version
       FROM catalog_state WHERE id=1`)
    .one().version;
}

function fromCursor(encoded: string, scope: string, version: number) {
  let cursor: { id?: unknown; scope?: unknown; version?: unknown };
  try {
    cursor = JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    throw new ApiError("VALIDATION", "Некорректная страница товаров");
  }
  if (!cursor || cursor.scope !== scope || typeof cursor.id !== "string")
    throw new ApiError("VALIDATION", "Некорректная страница товаров");
  if (cursor.version !== version) throw new ApiError("VERSION_CONFLICT", "Обновите список товаров");
  return cursor.id;
}

const pageSize = 16;
export function sellerProducts(
  storage: DurableObjectStorage,
  shopId: string,
  input: SellerProductQuery,
  revision: number,
) {
  const { q = "", filter = "all", category, brand, cursor } = input;
  const tokens =
    q
      .toLocaleLowerCase("ru")
      .replaceAll("ё", "е")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const scope = JSON.stringify([shopId, tokens, filter, category, brand]);
  const after = cursor ? fromCursor(cursor, scope, revision) : "";
  const filtersSql = [filters[filter], "p.id>?"];
  const params: SqlStorageValue[] = [after];
  if (q.trim()) {
    filtersSql.push(
      tokens.length
        ? "p.id IN (SELECT product_id FROM seller_product_search WHERE seller_product_search MATCH ?)"
        : "0",
    );
    if (tokens.length)
      params.push(
        tokens
          .slice(0, 8)
          .map((token) => `"${token}"*`)
          .join(" AND "),
      );
  }
  if (category) {
    filtersSql.push(`p.category_id IN (WITH RECURSIVE subtree(id) AS (
      SELECT id FROM categories WHERE id=? UNION SELECT c.id FROM categories c JOIN subtree s ON c.parent_id=s.id)
      SELECT id FROM subtree)`);
    params.push(category);
  }
  if (brand) {
    filtersSql.push("p.brand_id=?");
    params.push(brand);
  }
  const rows = storage.sql
    .exec<Row>(`${summary} WHERE ${filtersSql.join(" AND ")} ORDER BY p.id LIMIT ?`, ...params, pageSize + 1)
    .toArray();
  const items: SellerProductRow[] = rows.slice(0, pageSize).map(({ image, ...row }) => ({
    ...row,
    image: documentImage(image, shopId),
  }));
  return {
    items,
    nextCursor:
      rows.length > pageSize
        ? btoa(encodeURIComponent(JSON.stringify({ scope, version: revision, id: items.at(-1)?.id })))
        : null,
  };
}

export function sellerProduct(storage: DurableObjectStorage, shopId: string, id: string): SellerProduct {
  type ProductRow = Omit<SellerProduct, "variants" | "photos" | "recommendationIds"> & { recommendationIds: string };
  const [product] = storage.sql
    .exec<ProductRow>(
      `SELECT p.id,p.name,p.description,p.ingredients,p.storage_notes AS storageNotes,
    NULLIF(p.category_id,?) AS categoryId,p.brand_id AS brandId,p.recommendations,p.recommendation_ids AS recommendationIds,
    p.revision,p.sale_pause AS salePause,${statusSql} AS status FROM products p WHERE p.id=?`,
      uncategorizedId,
      id,
    )
    .toArray();
  if (!product) throw new ApiError("NOT_FOUND", "Товар не найден");
  const variants = storage.sql
    .exec<Omit<SellerVariant, "visible"> & { visible: number }>(
      `
    SELECT id,name,price_minor AS priceMinor,old_price_minor AS oldPriceMinor,promo_starts_at AS promoStartsAt,promo_ends_at AS promoEndsAt,visible,stock,stock_revision AS stockRevision,
    purchased,sale_pause AS salePause FROM variants WHERE product_id=? ORDER BY position,id`,
      id,
    )
    .toArray()
    .map(({ promoStartsAt, promoEndsAt, ...row }) => ({
      ...row,
      visible: Boolean(row.visible),
      ...(promoStartsAt != null && { promoStartsAt }),
      ...(promoEndsAt != null && { promoEndsAt }),
    }));
  const photos = storage.sql
    .exec<{ id: string; image: string }>(
      `SELECT m.id,${mediaJsonSql} AS image FROM product_photos pp
    JOIN media m ON m.id=pp.media_id WHERE pp.product_id=? AND m.ready=1 AND m.status='attached' ORDER BY pp.position`,
      id,
    )
    .toArray()
    .flatMap(({ id, image }) => {
      const photo = documentImage(image, shopId);
      return photo ? [{ id, image: photo }] : [];
    });
  return { ...product, recommendationIds: JSON.parse(product.recommendationIds), variants, photos };
}
