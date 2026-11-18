import type { CatalogOffer, CatalogPageInput, CatalogTile } from "../../../src/shared/contracts/catalog";
import { ApiError } from "../../../src/shared/errors";
import { catalogImage, documentImage } from "./images";
import { readNavigation } from "./navigation";
import { documentQuery, liveQuery, photosSql, productSql } from "./queries";

type Row = Record<string, SqlStorageValue>;
type TileRow = Row & {
  id: string;
  name: string;
  categoryId: string;
  brandId: string | null;
  photo: string | null;
  variants: string;
};
type Variant = {
  id: string;
  name: string;
  priceMinor: number;
  oldPriceMinor: number | null;
  stock: number | null;
  photoId: string | null;
};
type LiveRow = Row &
  Omit<CatalogOffer, "available" | "visible"> & {
    productId: string;
    priceMinor: number;
    visible: number;
    productAvailable: number;
  };

export function readDocument(storage: DurableObjectStorage, input: CatalogPageInput, shopId: string) {
  const { categories, brands } = readNavigation(storage, shopId);
  if (
    (input.category && !categories.some((category) => category.id === input.category)) ||
    (input.brand && !brands.some((brand) => brand.id === input.brand))
  )
    throw new ApiError("NOT_FOUND", "Раздел недоступен");
  const state = storage.sql.exec<{ version: number }>("SELECT version FROM catalog_state WHERE id=1").one();
  const query = documentQuery(input);
  const rows = storage.sql.exec<TileRow>(query.sql, ...query.params).toArray();
  const items: CatalogTile[] = rows.slice(0, input.limit).map(({ photo, variants, ...row }) => ({
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    brandId: row.brandId,
    image: documentImage(photo, shopId),
    variants: JSON.parse(variants),
  }));
  return {
    catalogVersion: state.version,
    categories,
    brands,
    items,
    next: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
  };
}

export function readLive(storage: DurableObjectStorage, ids: string[]) {
  const query = liveQuery(ids);
  const rows = storage.sql.exec<LiveRow>(query.sql, ...query.params).toArray();
  const state = storage.sql
    .exec<{ currency: string; hideOutOfStock: number; catalogVersion: number }>(
      "SELECT currency,hide_out_of_stock AS hideOutOfStock,version AS catalogVersion FROM catalog_state WHERE id=1",
    )
    .one();
  const offers = new Map(rows.map((row) => [row.id, row]));
  return {
    catalogVersion: state.catalogVersion,
    currency: state.currency,
    hideOutOfStock: Boolean(state.hideOutOfStock),
    // Tombstones remove deleted SKUs from an older public snapshot without retaining stale prices.
    items: ids.map((id): CatalogOffer => {
      const row = offers.get(id);
      if (!row)
        return {
          id,
          productId: null,
          priceMinor: null,
          oldPriceMinor: null,
          stock: null,
          visible: false,
          available: false,
        };
      const available = Boolean(row.visible && row.productAvailable && (row.stock === null || row.stock > 0));
      return {
        id: row.id,
        productId: row.productId,
        priceMinor: row.priceMinor,
        oldPriceMinor: row.oldPriceMinor,
        stock: row.stock,
        available,
        visible: Boolean(row.visible && row.productAvailable && (!state.hideOutOfStock || available)),
      };
    }),
  };
}

export function readProduct(storage: DurableObjectStorage, id: string, shopId: string, origin: string) {
  const row = storage.sql
    .exec<
      Row & {
        id: string;
        name: string;
        description: string;
        categoryId: string;
        brandId: string | null;
        catalogVersion: number;
        currency: string;
        hideOutOfStock: number;
        variants: string;
      }
    >(productSql, id)
    .toArray()[0];
  if (!row) throw new ApiError("NOT_FOUND", "Товар больше недоступен");
  const variants = (JSON.parse(row.variants) as Variant[]).map((v) => ({
    ...v,
    available: v.stock === null || v.stock > 0,
  }));
  if (!variants.length || (row.hideOutOfStock && variants.every((v) => !v.available)))
    throw new ApiError("NOT_FOUND", "Товар больше недоступен");
  const photos = storage.sql
    .exec<{
      id: string;
      edgeColor: string | null;
      contentBox: string | null;
      width: number | null;
      height: number | null;
    }>(photosSql, id)
    .toArray();
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    brandId: row.brandId,
    catalogVersion: row.catalogVersion,
    currency: row.currency,
    variants: row.hideOutOfStock ? variants.filter((v) => v.available) : variants,
    images: photos.map((p) => ({
      id: p.id,
      ...catalogImage(p.id, shopId, origin, {
        edgeColor: p.edgeColor ?? undefined,
        contentBox: p.contentBox ? JSON.parse(p.contentBox) : undefined,
        width: p.width ?? undefined,
        height: p.height ?? undefined,
      }),
    })),
  };
}
