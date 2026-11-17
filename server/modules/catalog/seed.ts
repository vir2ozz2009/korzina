import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import images from "../../../src/shared/demo-images.json";
import catalog from "../../demo-catalog.json";
import { settings } from "../../shop/schema";
import { media } from "../media/schema";
import { brands, catalogState, categories, productPhotos, products, variants } from "./schema";

// Shop invokes this only for the two owned demo identities. Stable SKU ids preserve carts.
export function seedCatalog(storage: DurableObjectStorage) {
  const marker = storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='catalog_seed'")
    .toArray()[0];
  if (marker?.value === "B2") return;
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
    for (const [id, image] of Object.entries(images)) {
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
          mime: "image/png",
          requestKey: `seed-${id}`,
          fingerprint: `seed-${id}`,
          createdAt: 1794873600000,
        })
        .onConflictDoUpdate({ target: media.id, set: values })
        .run();
    }
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
}
