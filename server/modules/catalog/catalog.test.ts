import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupPlatform } from "../../testing/platform";
import { seedCatalog } from "./seed";
import { catalogRequest, catalogSql, catalogStub, resetCatalog } from "./testing";

beforeAll(setupPlatform);
beforeEach(resetCatalog);
const live = async (ids = "sku-01,sku-02,sku-08,sku-12,sku-16") =>
  (await catalogRequest(`live?ids=${ids}`)).json<{
    catalogVersion: number;
    hideOutOfStock: boolean;
    items: { id: string; visible: boolean; available: boolean; stock: number | null; priceMinor: number }[];
  }>();

describe("правила каталога", () => {
  it("сид даёт фасовкам каждого товара уникальные названия и обновляет старые демо-данные", async () => {
    const duplicates = async () => {
      const rows = await catalogSql("SELECT product_id,name FROM variants");
      const keys = rows.map(({ product_id, name }) =>
        JSON.stringify([product_id, String(name).toLocaleLowerCase("ru").replace(/\s+/gu, "")]),
      );
      return keys.length - new Set(keys).size;
    };
    expect(await duplicates()).toBe(0);

    await catalogSql("DELETE FROM settings WHERE key='catalog_variant_names_seed'");
    await catalogSql("UPDATE variants SET name='125 г', stock=0 WHERE id='sku-08'");
    await evictDurableObject(catalogStub());

    expect(await duplicates()).toBe(0);
    expect(await catalogSql("SELECT name,stock FROM variants WHERE id='sku-08'")).toEqual([
      { name: "500 г", stock: 0 },
    ]);
  });

  it("сид сохраняет фасовки, целые цены VND, нулевой и неограниченный остаток; повторный запуск не сбрасывает изменения", async () => {
    const response = await catalogRequest("products/product-01");
    expect(response.status).toBe(200);
    const product = await response.json<{
      currency: string;
      variants: { id: string; priceMinor: number }[];
      images: { src: string; edgeColor: string }[];
    }>();
    expect(product.currency).toBe("VND");
    expect(product.variants).toMatchObject([
      { id: "sku-01", priceMinor: 45000 },
      { id: "sku-02", priceMinor: 79000 },
      { id: "sku-03", priceMinor: 149000 },
      { id: "sku-04", priceMinor: 69000 },
    ]);
    expect(product.images[0].src).toContain("/catalog/B2/figma45/tomato-");
    expect(product.images).toHaveLength(2);
    expect(product.images[1]).toMatchObject({ src: "/seed/tomato-gallery-2.png", edgeColor: "#c6c0b6" });
    expect(product.images[0].edgeColor).not.toBe(product.images[1].edgeColor);
    expect((await live()).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "sku-08", stock: 0, visible: true, available: false }),
        expect.objectContaining({ id: "sku-12", stock: null, visible: false, available: false }),
        expect.objectContaining({ id: "sku-16", stock: null, visible: true, available: true }),
      ]),
    );
    await catalogSql("UPDATE variants SET stock=1 WHERE id='sku-01'");
    await evictDurableObject(catalogStub());
    expect((await live()).items[0].stock).toBe(1);
    const other = await (await catalogRequest("live?ids=sku-01", "korzina-demo-test2")).json<{
      items: { stock: number }[];
    }>();
    expect(other.items[0].stock).toBe(2);
  });

  it("скрытие и снятие с публикации действуют сразу на фасовки и прямую ссылку; скрытые категории и бренды отсутствуют в навигации", async () => {
    await catalogSql("UPDATE products SET visible=0 WHERE id='product-01'");
    expect((await catalogRequest("products/product-01")).status).toBe(404);
    expect((await live("sku-01,sku-02")).items.every((v) => !v.visible && !v.available)).toBe(true);
    await catalogSql("UPDATE products SET published=0 WHERE id='product-05'");
    expect((await catalogRequest("products/product-05")).status).toBe(404);
    await catalogSql("UPDATE categories SET visible=0 WHERE id='milk'");
    await catalogSql("UPDATE brands SET visible=0 WHERE id='brand-1'");
    const document = await (await catalogRequest("document")).json<{
      categories: { id: string }[];
      brands: { id: string }[];
      items: { id: string }[];
    }>();
    expect(document.categories.some((c) => c.id === "milk")).toBe(false);
    expect(document.brands.some((b) => b.id === "brand-1")).toBe(false);
    expect(document.items.some((p) => ["product-01", "product-05"].includes(p.id))).toBe(false);
  });

  it("настройка скрытия распроданного меняется оперативно, а цена и остаток не меняют публичную версию", async () => {
    const initial = await live();
    await catalogSql("UPDATE variants SET price_minor=12345,stock=0 WHERE id='sku-01'");
    const updated = await live();
    expect(updated.catalogVersion).toBe(initial.catalogVersion);
    expect(updated.items[0]).toMatchObject({ priceMinor: 12345, stock: 0, available: false, visible: true });
    await catalogSql("UPDATE catalog_state SET hide_out_of_stock=1 WHERE id=1");
    expect((await live()).items.find((v) => v.id === "sku-08")).toMatchObject({ visible: false });
    await catalogSql("UPDATE variants SET stock=0 WHERE product_id='product-01'");
    expect((await catalogRequest("products/product-01")).status).toBe(404);
  });

  it("пагинация не повторяет товары; плитка не содержит описаний, цен и остатков; неверные параметры — единая ошибка", async () => {
    const first = await (await catalogRequest("document?limit=2")).json<{ next: string; items: object[] }>();
    const next = await (await catalogRequest(`document?limit=2&after=${first.next}`)).json<{ items: object[] }>();
    expect(first.items).toHaveLength(2);
    expect(next.items).toHaveLength(2);
    expect(first.items).not.toEqual(next.items);
    for (const item of first.items) {
      expect(item).not.toHaveProperty("description");
      expect(item).not.toHaveProperty("priceMinor");
      expect(item).not.toHaveProperty("stock");
    }
    const response = await exports.default.fetch(
      new Request("https://demo.korzina.app/api/catalog/document?limit=1000"),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION" } });
  });

  it("публичный Worker связывает документ и live одной версией, разделяет магазины и удаляет служебные метрики", async () => {
    const url = "https://demo.korzina.app/api/catalog/document?shop=lavka";
    const response = await exports.default.fetch(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.has("x-korzina-sql")).toBe(false);
    const document = await response.json<{ catalogVersion: number; items: { id: string }[] }>();
    expect(document.items.length).toBeGreaterThan(0);
    const etag = response.headers.get("ETag") as string;
    const same = await exports.default.fetch(
      new Request(`${url}&version=${document.catalogVersion}`, {
        headers: { "If-None-Match": etag, Cookie: "irrelevant=private" },
      }),
    );
    expect(same.status).toBe(304);
    const liveResponse = await exports.default.fetch(
      new Request("https://demo.korzina.app/api/catalog/live?shop=lavka&ids=sku-01"),
    );
    expect(await liveResponse.json()).toMatchObject({ catalogVersion: document.catalogVersion });
    expect(liveResponse.headers.get("Cache-Control")).toBe("no-store");
    const invalid = await exports.default.fetch(new Request("https://demo.korzina.app/api/catalog/live?ids="));
    expect(await invalid.json()).toMatchObject({ error: { code: "VALIDATION" } });
  });
});

it("обновление демо B1 объединяет наборы без смены SKU и потери корзин", async () => {
  await catalogRequest("live?ids=sku-01").then((r) => r.arrayBuffer());
  await runInDurableObject(catalogStub(), (_instance, ctx) => {
    ctx.storage.sql.exec("UPDATE settings SET value='B1' WHERE key='catalog_seed'");
    ctx.storage.sql.exec(
      "INSERT INTO products(id,name,category_id,published) VALUES('product-03','Томаты — набор','home',1)",
    );
    ctx.storage.sql.exec("UPDATE variants SET product_id='product-03' WHERE id='sku-03'");
    const lines = JSON.stringify([{ variantId: "sku-03", quantity: 2 }]);
    ctx.storage.sql.exec("INSERT INTO carts(customer,revision,lines) VALUES('seed-upgrade',1,?)", lines);
    seedCatalog(ctx.storage);
    expect(ctx.storage.sql.exec("SELECT count(*) AS n FROM products").one()).toEqual({ n: 7 });
    expect(ctx.storage.sql.exec("SELECT count(*) AS n FROM variants").one()).toEqual({ n: 25 });
    expect(ctx.storage.sql.exec("SELECT product_id FROM variants WHERE id='sku-03'").one()).toEqual({
      product_id: "product-01",
    });
    expect(ctx.storage.sql.exec("SELECT lines FROM carts WHERE customer='seed-upgrade'").one()).toEqual({ lines });
  });
});
