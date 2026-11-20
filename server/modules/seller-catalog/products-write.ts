import type {
  SellerProductInput,
  SellerStockConflict,
  SellerVariant,
} from "../../../src/shared/contracts/seller-catalog";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import type { ShopEnv } from "../../shop/env";
import { pauseUntil, uncategorizedId } from "../catalog/sale-pause";
import { attachCatalogPhoto, catalogPhotoIds, retireUnusedPhotos } from "./photos";
import { catalogVersion, sellerProduct } from "./products-read";

type Shop = ShopEnv["Bindings"];
const notFound = () => new ApiError("NOT_FOUND", "Товар не найден");
export function requireRevision(revision: number, expected: number | undefined) {
  if (revision !== expected) throw new ApiError("VERSION_CONFLICT", "Данные изменились", { revision });
}
export function requireGroup(storage: DurableObjectStorage, table: "categories" | "brands", id: string) {
  if (id === uncategorizedId || !storage.sql.exec(`SELECT 1 FROM ${table} WHERE id=?`, id).toArray().length)
    throw new ApiError("VALIDATION", "Выберите существующий раздел", {
      field: table === "brands" ? "brandId" : "categoryId",
    });
}
export function categoryForWrite(storage: DurableObjectStorage, id: string | null) {
  if (id) {
    requireGroup(storage, "categories", id);
    return id;
  }
  storage.sql.exec("INSERT OR IGNORE INTO categories(id,name,visible) VALUES (?,'',0)", uncategorizedId);
  return uncategorizedId;
}

function validateVariants(input: SellerProductInput, previous: Map<string, SellerVariant>) {
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const [index, variant] of input.variants.entries()) {
    const name = variant.name.normalize("NFKC").toLocaleLowerCase("ru").replace(/\s+/gu, " ");
    if (input.variants.length > 1 && !name)
      throw new ApiError("VALIDATION", "Укажите название фасовки", { field: "variantName", index });
    if (names.has(name)) throw new ApiError("DUPLICATE_VARIANT_NAME", "Фасовка с таким названием уже есть", { index });
    names.add(name);
    if (variant.id && (ids.has(variant.id) || !previous.has(variant.id)))
      throw new ApiError("VALIDATION", "Фасовка недоступна", { field: "variants", index });
    if (variant.id) ids.add(variant.id);
  }
}
export function stockConflict(
  variant: SellerVariant,
  before?: { stock: number | null; purchased: number },
): SellerStockConflict {
  const bought = before ? variant.purchased - before.purchased : 0;
  return {
    id: variant.id,
    before: before?.stock ?? null,
    stock: variant.stock,
    revision: variant.stockRevision,
    purchased: variant.purchased,
    ...(bought > 0 ? { bought } : {}),
  };
}

export function saveSellerProduct(env: Shop, accountId: string, input: SellerProductInput, editId?: string) {
  const { storage, shop } = env;
  const before = editId ? sellerProduct(storage, shop.id, editId) : undefined;
  if (before) requireRevision(before.revision, input.expectedRevision);
  if (!before && input.expectedRevision !== undefined)
    throw new ApiError("VALIDATION", "Новый товар ещё не имеет ревизии");
  const id = before?.id ?? crypto.randomUUID();
  const variants = new Map(before?.variants.map((variant) => [variant.id, variant]));
  validateVariants(input, variants);
  const categoryId = categoryForWrite(storage, input.categoryId);
  if (input.brandId) requireGroup(storage, "brands", input.brandId);
  if (input.recommendationIds.includes(id))
    throw new ApiError("VALIDATION", "Товар нельзя рекомендовать в собственной карточке", { field: "recommendations" });
  const added = input.recommendationIds.filter((target) => !before?.recommendationIds.includes(target));
  if (
    added.length !==
    storage.sql
      .exec(`SELECT id FROM products WHERE id IN (SELECT value FROM json_each(?))`, JSON.stringify(added))
      .toArray().length
  )
    throw new ApiError("VALIDATION", "Товар для рекомендации не найден", { field: "recommendations" });
  const retired = before ? catalogPhotoIds(storage, id) : [];
  const conflicts: SellerStockConflict[] = [];
  const now = Date.now();
  const pause = (value: "tomorrow" | "manual") => pauseUntil(value, now, env.timeZone ?? defaultShopTimeZone);

  const changes = input.variants.map((variant, position) => {
    const prior = variant.id ? variants.get(variant.id) : undefined;
    let nextStock = variant.stock;
    if (prior) {
      const baseline = variant.stockBaseline;
      if (!baseline && variant.stock !== prior.stock)
        throw new ApiError("VALIDATION", "Укажите исходную версию остатка", { field: "stock", index: position });
      if (!baseline || variant.stock === baseline.stock) nextStock = prior.stock;
      else if (baseline.revision !== prior.stockRevision) {
        nextStock = prior.stock;
        conflicts.push(stockConflict(prior, baseline));
      }
    }
    const salePause =
      variant.pause === "resume" ? null : variant.pause ? pause(variant.pause) : (prior?.salePause ?? null);
    return {
      ...variant,
      id: prior?.id ?? crypto.randomUUID(),
      name: variant.name || prior?.name || "",
      position,
      nextStock,
      salePause,
    };
  });
  const hasStock = changes.some((v) => v.visible && v.salePause === null && (v.nextStock === null || v.nextStock > 0));
  const visible = input.status !== "hidden";
  const productPause =
    input.status === "selling"
      ? null
      : input.status === "hidden"
        ? (before?.salePause ?? null)
        : input.pause
          ? pause(input.pause)
          : (before?.salePause ?? (hasStock ? 0 : null));

  const values = [
    input.name,
    input.description,
    input.ingredients,
    input.storageNotes,
    categoryId,
    input.brandId,
    Number(visible),
    productPause,
    input.recommendations,
    JSON.stringify(input.recommendationIds),
  ];
  if (before) {
    storage.sql.exec(
      `UPDATE products SET name=?,description=?,ingredients=?,storage_notes=?,category_id=?,brand_id=?,
      visible=?,sale_pause=?,recommendations=?,recommendation_ids=?,published=1,revision=revision+1 WHERE id=?`,
      ...values,
      id,
    );
  } else {
    storage.sql.exec(
      `INSERT INTO products(name,description,ingredients,storage_notes,category_id,brand_id,visible,sale_pause,
      recommendations,recommendation_ids,id,published,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,1)`,
      ...values,
      id,
    );
  }

  for (const variant of changes) {
    storage.sql.exec(
      `INSERT INTO variants(id,product_id,name,position,price_minor,old_price_minor,visible,stock,sale_pause)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position,
      price_minor=excluded.price_minor,old_price_minor=excluded.old_price_minor,visible=excluded.visible,
      stock=excluded.stock,sale_pause=excluded.sale_pause`,
      variant.id,
      id,
      variant.name,
      variant.position,
      variant.priceMinor,
      variant.oldPriceMinor,
      Number(variant.visible),
      variant.nextStock,
      variant.salePause,
    );
  }
  storage.sql.exec(
    "DELETE FROM variants WHERE product_id=? AND id NOT IN (SELECT value FROM json_each(?))",
    id,
    JSON.stringify(changes.map((variant) => variant.id)),
  );
  for (const photo of input.photos) attachCatalogPhoto(storage, accountId, photo);
  storage.sql.exec("DELETE FROM product_photos WHERE product_id=?", id);
  storage.sql.exec(
    `INSERT INTO product_photos(product_id,position,media_id)
    SELECT ?,key,value FROM json_each(?)`,
    id,
    JSON.stringify(input.photos.map((photo) => photo.id)),
  );
  retireUnusedPhotos(storage, retired, id);
  if (before) storage.sql.exec("UPDATE catalog_state SET version=version+1 WHERE id=1");
  return { product: sellerProduct(storage, shop.id, id), conflicts, revision: catalogVersion(storage) };
}

export function copySellerProduct(env: Shop, id: string, revision: number) {
  const { storage, shop } = env;
  const current = sellerProduct(storage, shop.id, id);
  requireRevision(current.revision, revision);
  const copy = crypto.randomUUID();
  storage.sql.exec(
    `INSERT INTO products(id,name,description,ingredients,storage_notes,category_id,brand_id,
    visible,published,revision,recommendations,recommendation_ids)
    SELECT ?,name || ' (копия)',description,ingredients,storage_notes,category_id,brand_id,0,1,1,recommendations,
    recommendation_ids FROM products WHERE id=?`,
    copy,
    id,
  );
  storage.sql.exec(
    `INSERT INTO variants(id,product_id,name,position,price_minor,old_price_minor,visible,stock,sale_pause,photo_id)
    SELECT lower(hex(randomblob(16))),?,name,position,price_minor,old_price_minor,visible,stock,sale_pause,photo_id
    FROM variants WHERE product_id=?`,
    copy,
    id,
  );
  storage.sql.exec(
    "INSERT INTO product_photos SELECT ?,position,media_id FROM product_photos WHERE product_id=?",
    copy,
    id,
  );
  return { product: sellerProduct(storage, shop.id, copy), conflicts: [], revision: catalogVersion(storage) };
}

export function deleteSellerProduct(storage: DurableObjectStorage, id: string) {
  const retired = catalogPhotoIds(storage, id);
  if (!storage.sql.exec("DELETE FROM products WHERE id=?", id).rowsWritten) throw notFound();
  retireUnusedPhotos(storage, retired, id);
}
