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

export const mediaJsonSql = `json_object('id',m.id,'edgeColor',m.edge_color,'contentBox',json(m.content_box),'width',m.width,'height',m.height)`;
const coverSql = `(SELECT ${mediaJsonSql} FROM product_photos pp JOIN media m ON m.id=pp.media_id
  WHERE pp.product_id=p.id AND m.status='attached' AND m.ready=1 ORDER BY pp.position LIMIT 1)`;

export function documentQuery(input: CatalogPageInput) {
  const conditions = ["p.published=1", "p.visible=1", "p.id>?"];
  const params: SqlStorageValue[] = [input.after ?? ""];
  if (input.category) {
    conditions.push(`p.category_id IN (WITH RECURSIVE subtree(id) AS (
      SELECT id FROM categories WHERE id=? AND visible=1
      UNION SELECT c.id FROM categories c JOIN subtree s ON c.parent_id=s.id WHERE c.visible=1
    ) SELECT id FROM subtree)`);
    params.push(input.category);
  }
  if (input.brand) {
    conditions.push("p.brand_id=?");
    params.push(input.brand);
  }
  params.push(input.limit + 1);
  return {
    sql: `SELECT p.id, p.name, p.category_id AS categoryId, p.brand_id AS brandId,
      ${coverSql} AS photo,
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

export const photosSql = `SELECT pp.media_id AS id,m.edge_color AS edgeColor,m.content_box AS contentBox,m.width,m.height FROM product_photos pp JOIN media m ON m.id=pp.media_id
  WHERE pp.product_id=? AND m.status='attached' AND m.ready=1 ORDER BY pp.position`;
