import { runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import catalog from "../../demo-catalog.json";

export const catalogStub = (id = "korzina-demo-lavka") => exports.Shop.get(exports.Shop.idFromName(id));
export function catalogRequest(path: string, id = "korzina-demo-lavka") {
  return catalogStub(id).fetch(
    new Request(`https://internal/api/catalog/${path}`, {
      headers: {
        "x-korzina-shop": encodeURIComponent(
          JSON.stringify({
            id,
            slug: "test",
            name: "Test",
            status: "active",
            plan: "base",
            createdAt: 0,
          }),
        ),
      },
    }),
  );
}

export async function catalogSql(query: string, ...params: SqlStorageValue[]) {
  return shopCatalogSql(query, params);
}

export async function shopCatalogSql(query: string, params: SqlStorageValue[], id?: string) {
  await (await catalogRequest("live?ids=sku-01", id)).arrayBuffer();
  return runInDurableObject(catalogStub(id), (_instance, ctx) => ctx.storage.sql.exec(query, ...params).toArray());
}

export const resetCatalog = () => resetShopCatalog();

export async function resetShopCatalog(id?: string) {
  await (await catalogRequest("live?ids=sku-01", id)).arrayBuffer();
  await runInDurableObject(catalogStub(id), (_instance, ctx) => {
    ctx.storage.transactionSync(() => {
      ctx.storage.sql.exec("UPDATE products SET visible=1,published=1");
      ctx.storage.sql.exec("UPDATE categories SET visible=1");
      ctx.storage.sql.exec("UPDATE brands SET visible=1");
      ctx.storage.sql.exec("UPDATE catalog_state SET hide_out_of_stock=0,currency='VND' WHERE id=1");
      for (const row of catalog.products)
        ctx.storage.sql.exec(
          "UPDATE variants SET price_minor=?,stock=?,visible=? WHERE id=?",
          row.price,
          row.stock,
          row.available ? 1 : 0,
          `sku-${String(row.id).padStart(2, "0")}`,
        );
    });
  });
}
