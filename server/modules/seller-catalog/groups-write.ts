import type {
  SellerCategoryOrder,
  SellerGroupDelete,
  SellerGroupInput,
  SellerGroupKind,
} from "../../../src/shared/contracts/seller-catalog";
import { ApiError } from "../../../src/shared/errors";
import type { ShopEnv } from "../../shop/env";
import { uncategorizedId } from "../catalog/sale-pause";
import { sellerGroup, sellerGroups } from "./groups-read";
import { attachCatalogPhoto, retireUnusedPhotos } from "./photos";
import { catalogVersion } from "./products-read";
import { categoryForWrite, requireGroup, requireRevision } from "./products-write";

type Shop = ShopEnv["Bindings"];
const descendants = `WITH RECURSIVE subtree(id) AS (
  SELECT ? UNION SELECT c.id FROM categories c JOIN subtree s ON c.parent_id=s.id
) SELECT id FROM subtree`;

export function saveGroup(env: Shop, accountId: string, kind: SellerGroupKind, input: SellerGroupInput, id?: string) {
  const { storage, shop } = env;
  const prior = id ? sellerGroup(storage, shop.id, kind, id) : undefined;
  if (prior) requireRevision(prior.revision, input.expectedRevision);
  if (!prior && input.expectedRevision !== undefined) throw new ApiError("VALIDATION", "Запись ещё не имеет ревизии");
  if (input.parentId && kind !== "categories") throw new ApiError("VALIDATION", "У бренда нет родителя");
  if (input.parentId) {
    requireGroup(storage, "categories", input.parentId);
    if (
      id &&
      storage.sql
        .exec<{ id: string }>(descendants, id)
        .toArray()
        .some((row) => row.id === input.parentId)
    )
      throw new ApiError("VALIDATION", "Выберите другую родительскую категорию");
  }

  const section = id ?? crypto.randomUUID();
  const photo = input.photo ?? null;
  if (photo) attachCatalogPhoto(storage, accountId, photo);
  const parentColumn = kind === "categories" ? ",parent_id" : "";
  const parentValue = kind === "categories" ? [input.parentId] : [];
  const parentFilter = kind === "categories" ? " WHERE parent_id IS ? AND id<>?" : "";
  const scope: SqlStorageValue[] = kind === "categories" ? [input.parentId, uncategorizedId] : [];
  const { position } = storage.sql
    .exec<{ position: number }>(`SELECT coalesce(max(position),-1)+1 AS position FROM ${kind}${parentFilter}`, ...scope)
    .one();

  storage.sql.exec(
    `INSERT INTO ${kind}(id,name,visible,photo_id,position,revision${parentColumn})
    VALUES (?,?,?,?,?,1${kind === "categories" ? ",?" : ""})
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,visible=excluded.visible,photo_id=excluded.photo_id,
    revision=${kind}.revision+1
    ${kind === "categories" ? ",position=CASE WHEN categories.parent_id IS excluded.parent_id THEN categories.position ELSE excluded.position END,parent_id=excluded.parent_id" : ""}`,
    section,
    input.name,
    Number(input.visible),
    photo?.id ?? null,
    position,
    ...parentValue,
  );
  if (prior?.photo && prior.photo.id !== photo?.id) retireUnusedPhotos(storage, [prior.photo.id]);
  // A photo's crop may have changed in place.
  storage.sql.exec("UPDATE catalog_state SET version=version+1 WHERE id=1");
  return { group: sellerGroup(storage, shop.id, kind, section), revision: catalogVersion(storage) };
}

export function deleteGroup(env: Shop, kind: SellerGroupKind, id: string, input: SellerGroupDelete) {
  const { storage, shop } = env;
  const group = sellerGroup(storage, shop.id, kind, id);
  requireRevision(group.revision, input.revision);
  const ids =
    kind === "categories"
      ? storage.sql
          .exec<{ id: string }>(descendants, id)
          .toArray()
          .map((row) => row.id)
      : [id];
  if (input.transferTo && ids.includes(input.transferTo)) throw new ApiError("VALIDATION", "Выберите другой раздел");
  if (group.hasProducts && input.transferTo === undefined)
    throw new ApiError("NOT_EMPTY", "Выберите, куда перенести товары");
  if (input.transferTo) requireGroup(storage, kind, input.transferTo);

  const key = kind === "categories" ? "category_id" : "brand_id";
  const list = JSON.stringify(ids);
  const refs = storage.sql
    .exec<{ id: string }>(
      `SELECT DISTINCT photo_id AS id FROM ${kind} WHERE id IN (SELECT value FROM json_each(?)) AND photo_id IS NOT NULL`,
      list,
    )
    .toArray();
  const transferred = group.hasProducts
    ? storage.sql
        .exec<{ id: string }>(
          `UPDATE products SET ${key}=?,revision=revision+1 WHERE ${key} IN (SELECT value FROM json_each(?)) RETURNING id`,
          kind === "categories" ? categoryForWrite(storage, input.transferTo ?? null) : (input.transferTo ?? null),
          list,
        )
        .toArray().length
    : 0;
  storage.sql.exec(`DELETE FROM ${kind} WHERE id IN (SELECT value FROM json_each(?))`, list);
  retireUnusedPhotos(
    storage,
    refs.map((row) => row.id),
  );
  return { id, transferred, revision: catalogVersion(storage) };
}

export function reorderCategories(env: Shop, input: SellerCategoryOrder) {
  const { storage, shop } = env;
  if (input.mosaic && input.parentId) throw new ApiError("VALIDATION", "В мозаике только корневые категории");
  if (input.parentId) requireGroup(storage, "categories", input.parentId);
  const siblings = sellerGroups(storage, shop.id, "categories").filter((row) => row.parentId === input.parentId);
  const scope = input.mosaic ? siblings.filter((row) => row.onStorefront && row.hasStorefrontProducts) : siblings;
  const revisions = new Map(scope.map((row) => [row.id, row.revision]));
  if (
    scope.length !== input.categories.length ||
    input.categories.some((row) => revisions.get(row.id) !== row.revision)
  )
    throw new ApiError("VERSION_CONFLICT", "Порядок категорий изменился");
  const visible = new Set(scope.map((row) => row.id));
  let index = 0;
  const entries = siblings.map((row) => (visible.has(row.id) ? input.categories[index++] : row));
  storage.sql.exec(
    `WITH sort AS (SELECT key AS position,json_extract(value,'$.id') AS id,
    json_extract(value,'$.tileSize') AS size FROM json_each(?))
    UPDATE categories SET position=sort.position,tile_size=coalesce(sort.size,categories.tile_size),revision=revision+1
    FROM sort WHERE categories.id=sort.id AND (categories.position IS NOT sort.position
      OR categories.tile_size IS NOT coalesce(sort.size,categories.tile_size))`,
    JSON.stringify(entries.map(({ id, tileSize }) => ({ id, ...(input.mosaic && tileSize && { tileSize }) }))),
  );
  return { groups: sellerGroups(storage, shop.id, "categories"), revision: catalogVersion(storage) };
}
