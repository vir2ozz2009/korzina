import type { CatalogPageInput } from "../../../src/shared/contracts/catalog";

// IS uses indexed OR seeks without the temporary IN btree (which adds N billed reads).
export function liveQuery(ids: string[]) {
  return {
    sql: `SELECT v.id, v.product_id AS productId, v.price_minor AS priceMinor,
  v.old_price_minor AS oldPriceMinor, v.stock, v.visible, v.product_available AS productAvailable
  FROM variants v
  WHERE ${ids.map(() => "v.id IS ?").join(" OR ")}`,
    params: ids,
  };
}

const variantMetadataSql = `SELECT id, name, photo_id AS photoId FROM variants
  WHERE product_id=p.id AND visible=1 ORDER BY position, id`;

const coverSql = `(SELECT pp.media_id FROM product_photos pp JOIN media m ON m.id=pp.media_id
  WHERE pp.product_id=p.id AND m.status='attached' AND m.ready=1 ORDER BY pp.position LIMIT 1)`;

export function documentQuery(input: CatalogPageInput) {
  const conditions = ["p.published=1", "p.visible=1", "p.id>?"];
  const params: SqlStorageValue[] = [input.after ?? ""];
  for (const [column, value] of [
    ["category_id", input.category],
    ["brand_id", input.brand],
  ] as const) {
    if (value) {
      conditions.push(`p.${column}=?`);
      params.push(value);
    }
  }
  params.push(input.limit + 1);
  return {
    sql: `SELECT p.id, p.name, p.category_id AS categoryId, p.brand_id AS brandId,
      ${coverSql} AS photoId,
      (SELECT json_group_array(json_object('id',id,'name',name,'photoId',photoId))
        FROM (${variantMetadataSql})) AS variants
      FROM products p WHERE ${conditions.join(" AND ")} ORDER BY p.id LIMIT ?`,
    params,
  };
}

export const productSql = `SELECT p.id, p.name, p.description, p.category_id AS categoryId,
  p.brand_id AS brandId, s.version AS catalogVersion, s.currency, s.hide_out_of_stock AS hideOutOfStock,
  (SELECT json_group_array(json_object('id',id,'name',name,'priceMinor',price_minor,
    'oldPriceMinor',old_price_minor,'stock',stock,'photoId',photo_id))
    FROM (SELECT id,name,price_minor,old_price_minor,stock,photo_id FROM variants
      WHERE product_id=p.id AND visible=1 ORDER BY position,id)) AS variants
  FROM products p CROSS JOIN catalog_state s
  WHERE p.id=? AND p.published=1 AND p.visible=1 AND s.id=1`;

export const photosSql = `SELECT pp.media_id AS id FROM product_photos pp JOIN media m ON m.id=pp.media_id
  WHERE pp.product_id=? AND m.status='attached' AND m.ready=1 ORDER BY pp.position`;
