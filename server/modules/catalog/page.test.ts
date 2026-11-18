import { exports } from "cloudflare:workers";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { setupPlatform } from "../../testing/platform";
import type { readPage } from "./page";
import { catalogRequest, catalogSql, resetCatalog } from "./testing";

type Page = Awaited<ReturnType<typeof readPage>>;
beforeAll(setupPlatform);
beforeEach(resetCatalog);
const page = async (query: string) => (await catalogRequest(`page?${query}`)).json<Page>();

it("единая страница по scope: категория, бренд, все, пустой/скрытый раздел; цены и остатки свежие", async () => {
  const category = await page("scope=category:home");
  expect(category.items.length).toBeGreaterThan(0);
  expect(category.items.every((p) => ["home", "home-tomatoes", "home-mixes"].includes(p.categoryId))).toBe(true);
  const brand = await page("scope=brand:brand-1");
  expect(brand.items.length).toBeGreaterThan(0);
  expect(brand.items.every((p) => p.brandId === "brand-1")).toBe(true);
  const empty = await page("scope=category:empty");
  expect(empty.items).toEqual([]);
  expect(empty.offers.items).toEqual([]);
  const request = () =>
    exports.default.fetch(new Request("https://demo.korzina.app/api/catalog/page?shop=test2&scope=category:home"));
  const first = await request();
  expect(first.headers.get("Cache-Control")).toBe("no-store");
  expect((await first.json<Page>()).offers.items.find((v) => v.id === "sku-01")?.priceMinor).toBe(45000);
  // This update targets the other shop: the cached document must never share live state.
  await catalogSql("UPDATE variants SET price_minor=76543,stock=0 WHERE id='sku-01'");
  expect((await page("scope=category:home")).offers.items.find((v) => v.id === "sku-01")).toMatchObject({
    priceMinor: 76543,
    stock: 0,
  });
  const worker = await exports.default.fetch(
    new Request("https://demo.korzina.app/api/catalog/page?shop=lavka&scope=category:home"),
  );
  expect((await worker.json<Page>()).offers.items.find((v) => v.id === "sku-01")?.priceMinor).toBe(76543);
  expect((await (await request()).json<Page>()).offers.items.find((v) => v.id === "sku-01")?.priceMinor).toBe(45000);
  await catalogSql("UPDATE categories SET visible=0 WHERE id='home'");
  expect((await catalogRequest("page?scope=category:home")).status).toBe(404);
  expect((await catalogRequest("page?scope=brand:missing")).status).toBe(404);
});

it("страницы по16, непрозрачный курсор связан со scope и ревизией; без пропусков и повторов", async () => {
  try {
    for (let i = 0; i < 19; i++) {
      await catalogSql(
        "INSERT INTO products(id,name,category_id,published,visible) VALUES(?,?,'empty',1,1)",
        `b3-page-${String(i).padStart(2, "0")}`,
        `Товар ${i}`,
      );
      await catalogSql(
        "INSERT INTO variants(id,product_id,name,price_minor,visible) VALUES(?,?,'1 шт.',100,1)",
        `b3-sku-${i}`,
        `b3-page-${String(i).padStart(2, "0")}`,
      );
    }
    const first = await page("scope=category:empty");
    expect(first.items).toHaveLength(16);
    expect(first.next).toBeTruthy();
    if (!first.next) throw new Error("Missing cursor");
    const second = await page(`scope=category:empty&cursor=${encodeURIComponent(first.next)}`);
    expect(second.items).toHaveLength(3);
    expect(second.next).toBeNull();
    expect(new Set([...first.items, ...second.items].map((p) => p.id)).size).toBe(19);
    expect((await catalogRequest(`page?scope=brand:brand-1&cursor=${encodeURIComponent(first.next)}`)).status).toBe(
      400,
    );
    expect((await catalogRequest("page?scope=all&cursor=broken")).status).toBe(400);
    await catalogSql("UPDATE products SET visible=0 WHERE id='b3-page-00'");
    expect((await catalogRequest(`page?scope=category:empty&cursor=${encodeURIComponent(first.next)}`)).status).toBe(
      409,
    );
  } finally {
    await catalogSql("DELETE FROM variants WHERE id LIKE 'b3-sku-%'");
    await catalogSql("DELETE FROM products WHERE id LIKE 'b3-page-%'");
  }
});
