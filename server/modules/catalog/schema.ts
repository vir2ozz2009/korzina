import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { media } from "../media/schema";

export const catalogState = sqliteTable("catalog_state", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull().default(1),
  sellerStockVersion: integer("seller_stock_version").notNull().default(0),
  selectionVersion: integer("selection_version").notNull().default(1),
  currency: text("currency").notNull().default("RUB"),
  hideOutOfStock: integer("hide_out_of_stock", { mode: "boolean" }).notNull().default(false),
});

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    tileSize: text("tile_size", { enum: ["1x1", "2x1", "1x2", "2x2"] }),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    position: integer("position").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    photoId: text("photo_id").references(() => media.id),
  },
  (t) => [
    index("categories_navigation_idx").on(t.visible, t.id),
    index("categories_parent_order_idx").on(t.parentId, t.position, t.id),
  ],
);

export const brands = sqliteTable(
  "brands",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    position: integer("position").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    photoId: text("photo_id").references(() => media.id),
  },
  (t) => [index("brands_navigation_idx").on(t.visible, t.id)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    brandId: text("brand_id").references(() => brands.id),
    ingredients: text("ingredients").notNull().default(""),
    storageNotes: text("storage_notes").notNull().default(""),
    revision: integer("revision").notNull().default(0),
    salePause: integer("sale_pause"),
    recommendations: text("recommendations", { enum: ["auto", "manual", "off"] })
      .notNull()
      .default("auto"),
    recommendationIds: text("recommendation_ids", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    availablePrice: integer("available_price"),
    catalogSoldOut: integer("catalog_sold_out").generatedAlwaysAs(sql`available_price IS NULL`),
    hasCatalogOffer: integer("has_catalog_offer").notNull().default(0),
    published: integer("published", { mode: "boolean" }).notNull().default(false),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [
    index("products_sale_pause_idx").on(t.salePause).where(sql`${t.salePause}>0`),
    index("products_storefront_idx").on(t.published, t.visible, t.id),
    index("products_category_idx").on(t.published, t.visible, t.categoryId, t.id),
    index("products_brand_idx").on(t.published, t.visible, t.brandId, t.id),
    index("products_catalog_availability_idx").on(t.published, t.visible, t.hasCatalogOffer, t.catalogSoldOut, t.id),
    index("products_catalog_available_name_idx").on(
      t.published,
      t.visible,
      t.hasCatalogOffer,
      t.catalogSoldOut,
      sql`${t.name} COLLATE NOCASE`,
      t.id,
    ),
  ],
);

export const productPhotos = sqliteTable(
  "product_photos",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id),
  },
  (t) => [primaryKey({ columns: [t.productId, t.position] })],
);

// B1: the SQL migration uses WITHOUT ROWID so the SKU key is the clustered primary key.
// This avoids a second table lookup and an unnecessary covering index on every live read.
export const variants = sqliteTable(
  "variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    priceMinor: integer("price_minor").notNull(),
    oldPriceMinor: integer("old_price_minor"),
    stock: integer("stock"),
    stockRevision: integer("stock_revision").notNull().default(0),
    purchased: integer("purchased").notNull().default(0),
    salePause: integer("sale_pause"),
    productPaused: integer("product_paused", { mode: "boolean" }).notNull().default(false),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    // B1: maintained by SQL triggers; live reads need no product JOIN per SKU.
    productAvailable: integer("product_available", { mode: "boolean" }).notNull().default(false),
    photoId: text("photo_id").references(() => media.id),
  },
  (t) => [
    index("variants_sale_pause_idx").on(t.salePause).where(sql`${t.salePause}>0`),
    index("variants_product_idx").on(t.productId, t.visible, t.position),
    check("variants_price_check", sql`${t.priceMinor} BETWEEN 0 AND 9007199254740991`),
    check(
      "variants_old_price_check",
      sql`${t.oldPriceMinor} IS NULL OR ${t.oldPriceMinor} BETWEEN 0 AND 9007199254740991`,
    ),
    check("variants_stock_check", sql`${t.stock} IS NULL OR ${t.stock} BETWEEN 0 AND 9007199254740991`),
  ],
);
