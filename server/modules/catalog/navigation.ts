import { documentImage } from "./images";
import { mediaJsonSql } from "./queries";

type NavigationRow = { id: string; name: string; parentId: string | null; photo: string | null; hasProducts: number };
const visibleProduct = `p.published=1 AND p.visible=1 AND EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.visible=1)`;
const ownPhoto = `(SELECT ${mediaJsonSql} FROM media m WHERE m.id=n.photoId AND m.ready=1 AND m.status='attached')`;
const productPhoto = (condition: string) => `(SELECT ${mediaJsonSql} FROM products p
  JOIN product_photos pp ON pp.product_id=p.id JOIN media m ON m.id=pp.media_id
  WHERE ${visibleProduct} AND ${condition} AND m.status='attached' AND m.ready=1 ORDER BY p.id,pp.position LIMIT 1)`;
const categoryProducts = "p.category_id IN (SELECT id FROM descendants WHERE root=n.id)";

export const categoriesSql = `WITH RECURSIVE navigation AS (
  SELECT id,name,parent_id AS parentId,photo_id AS photoId,position FROM categories WHERE visible=1 AND parent_id IS NULL AND id<>'__uncategorized__'
  UNION ALL SELECT c.id,c.name,c.parent_id,c.photo_id,c.position FROM categories c JOIN navigation n ON c.parent_id=n.id WHERE c.visible=1),
  descendants(root,id) AS (SELECT id,id FROM navigation UNION ALL SELECT d.root,n.id FROM navigation n JOIN descendants d ON n.parentId=d.id)
  SELECT n.id,n.name,n.parentId,EXISTS(SELECT 1 FROM products p WHERE ${visibleProduct} AND ${categoryProducts}) AS hasProducts,
  COALESCE(${ownPhoto},${productPhoto(categoryProducts)}) AS photo FROM navigation n ORDER BY n.position,n.id`;
export const brandsSql = `WITH navigation AS (SELECT id,name,photo_id AS photoId,position FROM brands WHERE visible=1)
  SELECT n.id,n.name,NULL AS parentId,EXISTS(SELECT 1 FROM products p WHERE ${visibleProduct} AND p.brand_id=n.id) AS hasProducts,
  COALESCE(${ownPhoto},${productPhoto("p.brand_id=n.id")}) AS photo FROM navigation n ORDER BY n.position,n.id`;

export function readNavigation(storage: DurableObjectStorage, shopId: string) {
  const read = (sql: string) =>
    storage.sql
      .exec<NavigationRow>(sql)
      .toArray()
      .map(({ photo, hasProducts, ...row }) => ({
        ...row,
        hasProducts: Boolean(hasProducts),
        image: documentImage(photo, shopId),
      }));
  return { categories: read(categoriesSql), brands: read(brandsSql) };
}
