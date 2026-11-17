import { drizzle } from "drizzle-orm/durable-sqlite";
import catalog from "../../demo-catalog.json";
import { settings } from "../../shop/schema";
import { media } from "../media/schema";
import { brands, catalogState, categories, productPhotos, products, variants } from "./schema";

// Only the two owned demo identities are seeded; never reset edits or seed production shops.
export function seedCatalog(storage: DurableObjectStorage) {
  if (storage.sql.exec("SELECT value FROM settings WHERE key='catalog_seed'").toArray().length) return;
  const db = drizzle(storage);
  storage.transactionSync(() => {
    db.update(catalogState).set({ currency: catalog.currency }).run();
    const categoryIds = new Map(catalog.categories.map((c) => [c.name, c.id]));
    const brandIds = new Map(catalog.brands.map((name, index) => [name, `brand-${index + 1}`]));
    db.insert(categories)
      .values(catalog.categories.map((c, position) => ({ ...c, position })))
      .run();
    db.insert(brands)
      .values(catalog.brands.map((name, position) => ({ id: `brand-${position + 1}`, name, position })))
      .run();
    const photos = [...new Set(catalog.products.map((p) => p.art))].flatMap((art) => [art, `${art}-info`]);
    for (let offset = 0; offset < photos.length; offset += 6)
      db.insert(media)
        .values(
          photos.slice(offset, offset + 6).map((art) => ({
            id: `demo-${art}`,
            owner: "demo-seed",
            purpose: "product" as const,
            status: "attached" as const,
            ready: true,
            bytes: 0,
            mime: "image/webp",
            requestKey: `seed-${art}`,
            fingerprint: `seed-${art}`,
            createdAt: 1794873600000,
          })),
        )
        .run();
    const groups = new Map<string, typeof catalog.products>();
    for (const product of catalog.products) {
      const key = `${product.name}|${product.brand}`;
      const rows = groups.get(key) ?? [];
      rows.push(product);
      groups.set(key, rows);
    }
    for (const rows of groups.values()) {
      const first = rows[0];
      const id = `product-${String(first.id).padStart(2, "0")}`;
      db.insert(products)
        .values({
          id,
          name: first.name,
          description: first.desc,
          categoryId: categoryIds.get(first.category) as string,
          brandId: brandIds.get(first.brand) ?? null,
          published: true,
        })
        .run();
      db.insert(productPhotos)
        .values([
          { productId: id, position: 0, mediaId: `demo-${first.art}` },
          { productId: id, position: 1, mediaId: `demo-${first.art}-info` },
        ])
        .run();
      db.insert(variants)
        .values(
          rows.map((row, position) => ({
            id: `sku-${String(row.id).padStart(2, "0")}`,
            productId: id,
            name: row.unit,
            position,
            priceMinor: row.price,
            oldPriceMinor: row.old || null,
            stock: row.stock,
            visible: row.available,
          })),
        )
        .run();
    }
    db.insert(settings).values({ key: "catalog_seed", value: "B1" }).run();
  });
}
