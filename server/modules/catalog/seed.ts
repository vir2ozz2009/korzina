import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import images from "../../../src/shared/demo-images.json";
import catalog from "../../demo-catalog.json";
import { settings } from "../../shop/schema";
import { seedFulfillment } from "../fulfillment/seed";
import { media } from "../media/schema";
import { brands, catalogState, categories, productPhotos, products, variants } from "./schema";
import { seedNavigation } from "./seed-navigation";

// Invoked by the non-production seed command. Stable SKU ids preserve carts.
export function seedCatalog(storage: DurableObjectStorage) {
  seedFulfillment(storage);
  const marker = storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='catalog_seed'")
    .toArray()[0];
  if (marker?.value === "B2") {
    seedNavigation(storage);
    seedGallery(storage);
    seedShoppingItem(storage);
    seedVariantNames(storage);
    return;
  }
  const db = drizzle(storage);
  storage.transactionSync(() => {
    db.update(catalogState).set({ currency: catalog.currency }).run();
    const categoryIds = new Map(catalog.categories.map((c) => [c.name, c.id]));
    const brandIds = new Map(catalog.brands.map((name, i) => [name, `brand-${i + 1}`]));
    for (const [position, c] of catalog.categories.entries())
      db.insert(categories)
        .values({ ...c, position })
        .onConflictDoUpdate({ target: categories.id, set: { name: c.name, position } })
        .run();
    for (const [position, name] of catalog.brands.entries())
      db.insert(brands)
        .values({ id: `brand-${position + 1}`, name, position })
        .onConflictDoUpdate({ target: brands.id, set: { name, position } })
        .run();
    for (const [id, image] of Object.entries(images)) seedPhoto(db, id, image);
    const groups = new Map<string, typeof catalog.products>();
    for (const row of catalog.products) {
      const rows = groups.get(row.art) ?? [];
      rows.push(row);
      groups.set(row.art, rows);
    }
    const canonical: string[] = [];
    for (const rows of groups.values()) {
      const first = rows[0],
        id = `product-${String(first.id).padStart(2, "0")}`;
      canonical.push(id);
      const values = {
        name: first.name,
        description: first.desc,
        categoryId: categoryIds.get(first.category) as string,
        brandId: brandIds.get(first.brand) ?? null,
        published: true,
      };
      db.insert(products)
        .values({ id, ...values })
        .onConflictDoUpdate({ target: products.id, set: values })
        .run();
      for (const [position, row] of rows.entries()) {
        const values = {
          productId: id,
          name: row.unit,
          position,
          priceMinor: row.price,
          oldPriceMinor: row.old || null,
          stock: row.stock,
          visible: row.available,
        };
        db.insert(variants)
          .values({ id: `sku-${String(row.id).padStart(2, "0")}`, ...values })
          .onConflictDoUpdate({ target: variants.id, set: values })
          .run();
      }
      db.delete(productPhotos)
        .where(inArray(productPhotos.productId, [id]))
        .run();
      db.insert(productPhotos)
        .values({ productId: id, position: 0, mediaId: `demo-${first.art}` })
        .run();
    }
    const obsolete = catalog.products
      .map((row) => `product-${String(row.id).padStart(2, "0")}`)
      .filter((id) => !canonical.includes(id));
    // Reparent all seed SKUs before deleting their former bundle/brandless product rows.
    if (obsolete.length) db.delete(products).where(inArray(products.id, obsolete)).run();
    db.insert(settings)
      .values({ key: "catalog_seed", value: "B2" })
      .onConflictDoUpdate({ target: settings.key, set: { value: "B2" } })
      .run();
  });
  seedNavigation(storage);
  seedGallery(storage);
  seedShoppingItem(storage);
  seedVariantNames(storage);
}

function seedVariantNames(storage: DurableObjectStorage) {
  const key = "catalog_variant_names_seed";
  if (storage.sql.exec("SELECT 1 FROM settings WHERE key=?", key).toArray().length) return;
  const previousNames = new Map([
    [4, "500 г"],
    [8, "125 г"],
    [12, "700 г"],
    [16, "1 л"],
    [20, "250 г"],
    [24, "1 шт."],
  ]);
  storage.transactionSync(() => {
    for (const { id, unit } of catalog.products) {
      const previousName = previousNames.get(id);
      if (previousName) {
        storage.sql.exec(
          "UPDATE variants SET name=? WHERE id=? AND name=?",
          unit,
          `sku-${String(id).padStart(2, "0")}`,
          previousName,
        );
      }
    }
    storage.sql.exec("INSERT INTO settings(key,value) VALUES(?, 'B6')", key);
  });
}

function seedPhoto(
  db: ReturnType<typeof drizzle>,
  id: string,
  image: (typeof images)[keyof typeof images],
  mime = "image/png",
) {
  const values = {
    edgeColor: image.edgeColor,
    contentBox: image.contentBox,
    width: image.width,
    height: image.height,
  };
  db.insert(media)
    .values({
      id,
      ...values,
      owner: "demo-seed",
      purpose: "product",
      status: "attached",
      ready: true,
      bytes: 0,
      mime,
      requestKey: `seed-${id}`,
      fingerprint: `seed-${id}`,
      createdAt: 1794873600000,
    })
    .onConflictDoUpdate({ target: media.id, set: values })
    .run();
}

function seedGallery(storage: DurableObjectStorage) {
  const key = "catalog_gallery_seed";
  if (storage.sql.exec("SELECT 1 FROM settings WHERE key=?", key).toArray().length) return;
  const db = drizzle(storage);
  storage.transactionSync(() => {
    const id = "demo-tomato-gallery-2";
    seedPhoto(db, id, images[id]);
    db.insert(productPhotos).values({ productId: "product-01", position: 1, mediaId: id }).onConflictDoNothing().run();
    db.insert(settings).values({ key, value: "B4" }).onConflictDoNothing().run();
  });
}

function seedShoppingItem(storage: DurableObjectStorage) {
  const key = "shopping_demo_photo_seed";
  if (storage.sql.exec("SELECT 1 FROM settings WHERE key=?", key).toArray().length) return;
  const db = drizzle(storage);
  storage.transactionSync(() => {
    const productId = "product-25";
    db.insert(products)
      .values({ id: productId, name: "Огурцы хрустящие", categoryId: "home", published: true })
      .onConflictDoNothing()
      .run();
    db.insert(variants)
      .values({ id: "sku-25", productId, name: "500 г", priceMinor: 55000, stock: 15 })
      .onConflictDoNothing()
      .run();
    const photoId = "demo-cucumber";
    seedPhoto(db, photoId, images[photoId], "image/webp");
    db.insert(productPhotos).values({ productId, position: 0, mediaId: photoId }).onConflictDoNothing().run();
    db.insert(settings).values({ key, value: "B5b" }).onConflictDoNothing().run();
  });
}
