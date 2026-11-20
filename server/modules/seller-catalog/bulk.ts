import type { SellerBulkInput, SellerStockInput, SellerVariant } from "../../../src/shared/contracts/seller-catalog";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import type { ShopEnv } from "../../shop/env";
import { pauseUntil } from "../catalog/sale-pause";
import { catalogVersion, sellerProduct } from "./products-read";
import { categoryForWrite, deleteSellerProduct, stockConflict } from "./products-write";

type Shop = ShopEnv["Bindings"];
type Product = { id: string; name: string; visible: number; revision: number; salePause: number | null };
type Variant = SellerVariant & { productId: string };
type Failure = { id: string; code: string; name?: string; conflicts?: ReturnType<typeof stockConflict>[] };

export function runCatalogBulk({ storage, timeZone }: Shop, input: SellerBulkInput) {
  const { action, products } = input;
  const ids = JSON.stringify(products.map((row) => row.id));
  const existing = new Map(
    storage.sql
      .exec<Product>(
        "SELECT id,name,visible,revision,sale_pause AS salePause FROM products WHERE id IN (SELECT value FROM json_each(?))",
        ids,
      )
      .toArray()
      .map((row) => [row.id, row]),
  );
  const sku = new Map<string, Variant[]>();
  for (const row of storage.sql.exec<Omit<Variant, "visible"> & { visible: number }>(
    `SELECT id,product_id AS productId,name,
    price_minor AS priceMinor,old_price_minor AS oldPriceMinor,stock,stock_revision AS stockRevision,
    purchased,visible,sale_pause AS salePause FROM variants WHERE product_id IN (SELECT value FROM json_each(?))`,
    ids,
  )) {
    const variants = sku.get(row.productId) ?? [];
    variants.push({ ...row, visible: Boolean(row.visible) });
    sku.set(row.productId, variants);
  }
  const stockInput = action.kind === "stock" ? action.variants : action.kind === "resume" ? (action.stock ?? []) : [];
  const stockEdits = new Map(stockInput.map((edit) => [edit.id, edit]));
  const existingSku = new Set([...sku.values()].flatMap((variants) => variants.map((variant) => variant.id)));
  if (stockInput.some((edit) => !existingSku.has(edit.id)) && products.every((row) => existing.has(row.id)))
    throw new ApiError("VALIDATION", "Выбрана недоступная фасовка");

  const category = action.kind === "category" ? categoryForWrite(storage, action.categoryId) : undefined;
  const pause =
    action.kind === "pause" ? pauseUntil(action.duration, Date.now(), timeZone ?? defaultShopTimeZone) : null;
  const applied: string[] = [];
  const failed: Failure[] = [];
  for (const target of products) {
    const current = existing.get(target.id);
    if (!current) {
      failed.push({ id: target.id, code: "NOT_FOUND" });
      continue;
    }
    const reject = (code: string, conflicts?: Failure["conflicts"]) =>
      failed.push({ id: current.id, name: current.name, code, conflicts });
    if (current.revision !== target.revision) {
      reject("VERSION_CONFLICT");
      continue;
    }

    const variants = sku.get(target.id) ?? [];
    const visible = variants.filter((variant) => variant.visible);
    const scopedId = (action.kind === "pause" || action.kind === "resume") && action.variantId;
    const affected = scopedId ? visible.filter((v) => v.id === scopedId) : visible;
    const quantity = variants.filter((variant) => stockEdits.has(variant.id));
    const conflicts = quantity.filter((variant) => variant.stockRevision !== stockEdits.get(variant.id)?.revision);
    if (conflicts.length) {
      reject(
        "STOCK_CHANGED",
        conflicts.map((variant) => stockConflict(variant)),
      );
      continue;
    }
    if (
      ((action.kind === "show" || action.kind === "resume" || scopedId) && !affected.length) ||
      (action.kind === "resume" && !current.visible)
    ) {
      reject("VISIBILITY_REQUIRED");
      continue;
    }
    if (
      action.kind === "resume" &&
      !affected.some((variant) => {
        const edit = stockEdits.get(variant.id);
        const value = edit ? edit.stock : variant.stock;
        return value === null || value > 0;
      })
    ) {
      reject("STOCK_REQUIRED");
      continue;
    }
    if (action.kind === "stock" && !quantity.length) {
      reject("STOCK_REQUIRED");
      continue;
    }
    if (action.kind === "delete") deleteSellerProduct(storage, target.id);
    else {
      if (action.kind === "hide" || action.kind === "show") {
        storage.sql.exec(
          "UPDATE products SET visible=?,published=1 WHERE id=?",
          Number(action.kind === "show"),
          target.id,
        );
      }
      if (category !== undefined) storage.sql.exec("UPDATE products SET category_id=? WHERE id=?", category, target.id);
      if (action.kind === "pause" || action.kind === "resume") {
        if (scopedId) storage.sql.exec("UPDATE variants SET sale_pause=? WHERE id=?", pause, scopedId);
        else {
          storage.sql.exec("UPDATE products SET sale_pause=? WHERE id=?", pause, target.id);
          if (action.kind === "resume")
            storage.sql.exec(
              "UPDATE variants SET sale_pause=NULL WHERE product_id=? AND visible=1 AND sale_pause IS NOT NULL",
              target.id,
            );
        }
      }
      for (const variant of quantity) {
        const edit = stockEdits.get(variant.id);
        if (edit) storage.sql.exec("UPDATE variants SET stock=? WHERE id=?", edit.stock, edit.id);
      }
      storage.sql.exec("UPDATE products SET revision=revision+1 WHERE id=?", target.id);
    }
    applied.push(target.id);
  }
  if (applied.length) storage.sql.exec("UPDATE catalog_state SET version=version+1 WHERE id=1");
  return { applied, failed, revision: catalogVersion(storage) };
}

export function confirmCatalogStock(env: Shop, id: string, edits: SellerStockInput) {
  const current = sellerProduct(env.storage, env.shop.id, id);
  const variants = new Map(current.variants.map((variant) => [variant.id, variant]));
  const conflicts = [];
  for (const edit of edits) {
    const variant = variants.get(edit.id);
    if (!variant) throw new ApiError("VALIDATION", "Фасовка недоступна");
    if (variant.stockRevision !== edit.revision) conflicts.push(stockConflict(variant));
  }
  if (conflicts.length) return { product: current, conflicts, revision: catalogVersion(env.storage) };
  for (const edit of edits) env.storage.sql.exec("UPDATE variants SET stock=? WHERE id=?", edit.stock, edit.id);
  env.storage.sql.exec("UPDATE catalog_state SET version=version+1 WHERE id=1");
  return { product: sellerProduct(env.storage, env.shop.id, id), conflicts, revision: catalogVersion(env.storage) };
}
