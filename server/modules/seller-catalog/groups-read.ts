import type { SellerGroup, SellerGroupKind } from "../../../src/shared/contracts/seller-catalog";
import { ApiError } from "../../../src/shared/errors";
import { documentImage } from "../catalog/images";
import { readNavigation } from "../catalog/navigation";
import { mediaJsonSql } from "../catalog/queries";
import { uncategorizedId } from "../catalog/sale-pause";

type GroupRow = Omit<
  SellerGroup,
  "visible" | "onStorefront" | "hasStorefrontProducts" | "photo" | "image" | "hasProducts"
> & {
  visible: number;
  affected: number;
  mediaId: string | null;
  ownPhoto: string | null;
};
export function sellerGroups(storage: DurableObjectStorage, shopId: string, kind: SellerGroupKind, id?: string) {
  const category = kind === "categories";
  const rows = storage.sql
    .exec<GroupRow>(
      `SELECT g.id,g.name,g.visible,g.position,g.revision,${category ? "g.parent_id" : "NULL"} AS parentId,
      ${category ? "g.tile_size" : "NULL"} AS tileSize,m.id AS mediaId,
      CASE WHEN m.id IS NOT NULL THEN ${mediaJsonSql} END AS ownPhoto,
      EXISTS(SELECT 1 FROM products p WHERE ${
        category
          ? `p.category_id IN (WITH RECURSIVE subtree(id) AS (SELECT g.id UNION SELECT c.id FROM categories c JOIN subtree s ON c.parent_id=s.id) SELECT id FROM subtree)`
          : "p.brand_id=g.id"
      }) AS affected
    FROM ${kind} g LEFT JOIN media m ON m.id=g.photo_id AND m.ready=1 AND m.status='attached'
    WHERE g.id<>? ${id ? "AND g.id=?" : ""} ORDER BY g.position,g.id`,
      uncategorizedId,
      ...(id ? [id] : []),
    )
    .toArray();
  const publicGroups = new Map(readNavigation(storage, shopId)[kind].map((group) => [group.id, group]));
  return rows.map(({ visible, affected, mediaId, ownPhoto, ...row }): SellerGroup => {
    const nav = publicGroups.get(row.id);
    const image = documentImage(ownPhoto, shopId);
    return {
      ...row,
      visible: Boolean(visible),
      onStorefront: Boolean(nav),
      hasStorefrontProducts: nav?.hasProducts ?? false,
      hasProducts: Boolean(affected),
      photo: mediaId && image ? { id: mediaId, image } : null,
      image: image ?? (category ? (nav?.image ?? null) : null),
    };
  });
}
export function sellerGroup(storage: DurableObjectStorage, shopId: string, kind: SellerGroupKind, id: string) {
  const [group] = sellerGroups(storage, shopId, kind, id);
  if (!group) throw new ApiError("NOT_FOUND", kind === "categories" ? "Категория не найдена" : "Бренд не найден");
  return group;
}
