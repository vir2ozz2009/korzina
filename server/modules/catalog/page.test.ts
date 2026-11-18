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
    const sortedQuery = "scope=category:empty&sort=price-desc&max=100&inStock=1";
    const sorted = await page(sortedQuery);
    expect(sorted.items).toHaveLength(16);
    expect(sorted.count).toBe(19);
    expect(sorted.next).toBeTruthy();
    const sortedNext = `${sortedQuery}&cursor=${encodeURIComponent(sorted.next ?? "")}`;
    const remainder = await page(sortedNext);
    expect(new Set([...sorted.items, ...remainder.items].map((product) => product.id)).size).toBe(19);
    await catalogSql("UPDATE variants SET price_minor=101 WHERE id='b3-sku-1'");
    expect((await catalogRequest(`page?${sortedNext}`)).status).toBe(409);
    await catalogSql("UPDATE products SET visible=0 WHERE id='b3-page-00'");
    expect((await catalogRequest(`page?scope=category:empty&cursor=${encodeURIComponent(first.next)}`)).status).toBe(
      409,
    );
  } finally {
    await catalogSql("DELETE FROM variants WHERE id LIKE 'b3-sku-%'");
    await catalogSql("DELETE FROM products WHERE id LIKE 'b3-page-%'");
  }
});

it("диапазон и сортировка используют только доступную фасовку и свежую цену", async () => {
  await catalogSql("UPDATE variants SET stock=0, price_minor=1 WHERE id='sku-01'");
  const cheap = await page("scope=category:home&sort=price-asc&max=10");
  expect(cheap.items.some((item) => item.id === "product-01")).toBe(false);
  await catalogSql("UPDATE variants SET stock=1, price_minor=2 WHERE id='sku-01'");
  const updated = await page("scope=category:home&sort=price-asc&min=1&max=10&inStock=1");
  expect(updated.items[0]?.id).toBe("product-01");
  expect(updated.count).toBe(1);
  expect(updated.offers.items.find((item) => item.id === "sku-01")?.priceMinor).toBe(2);
  const plan = await catalogSql(
    "EXPLAIN QUERY PLAN SELECT id FROM products WHERE published=1 AND visible=1 AND has_catalog_offer=1 ORDER BY coalesce(available_price, -1), id LIMIT 17",
  );
  expect(plan.map((row) => row.detail).join(" ")).toMatch(/SEARCH.*products_catalog_price_idx/);
});

it("отправляет распроданные товары в конец до пагинации и обновляет ревизию при смене наличия", async () => {
  const ids = Array.from({ length: 38 }, (_, i) => `stock-page-${String(i).padStart(2, "0")}`);
  const inStock = ids.filter((_, i) => i % 2 === 1);
  const sold = ids.filter((_, i) => i % 2 === 0);
  const scope = "scope=category:empty";
  try {
    await catalogSql(
      `INSERT INTO products(id,name,category_id,published,visible)
       SELECT value,value,'empty',1,1 FROM json_each(?)`,
      JSON.stringify(ids),
    );
    await catalogSql(
      `INSERT INTO variants(id,product_id,name,price_minor,stock,visible)
       SELECT 'sku-'||value,value,'1 шт.',100+CAST(key AS integer),CAST(key AS integer)%2,1 FROM json_each(?)`,
      JSON.stringify(ids),
    );
    for (const sort of ["default", "name", "price-asc", "price-desc"]) {
      let current = await page(`${scope}&sort=${sort}`);
      expect(current.items).toHaveLength(16);
      expect(current.items.every(({ id }) => inStock.includes(id))).toBe(true);
      const ordered = current.items.map(({ id }) => id);
      while (current.next) {
        current = await page(`${scope}&sort=${sort}&cursor=${encodeURIComponent(current.next)}`);
        expect(current.items.length).toBeGreaterThan(0);
        ordered.push(...current.items.map(({ id }) => id));
        expect(ordered.length).toBeLessThanOrEqual(ids.length);
      }
      const expected =
        sort === "price-desc" ? [...inStock].reverse().concat([...sold].reverse()) : inStock.concat(sold);
      expect(ordered).toEqual(expected);
    }

    const search = await catalogRequest("search?q=stock-page&cat=empty");
    expect(search.status).toBe(200);
    const matches = (await search.json<Page>()).items;
    expect(matches).toHaveLength(16);
    expect(matches.every(({ id }) => inStock.includes(id))).toBe(true);

    const query = "document?category=empty&limit=16&count=1";
    const read = async (path: string) => (await catalogRequest(path)).json<Omit<Page, "offers">>();
    const first = await read(query);
    expect(first.items.map(({ id }) => id)).toEqual(inStock.slice(0, 16));
    expect(first.count).toBe(38);
    const after = (page: Omit<Page, "offers">) =>
      `${query}&after=${encodeURIComponent(page.next ?? "")}&version=${page.catalogVersion}`;
    const second = await read(after(first));
    const third = await read(after(second));
    expect([...second.items, ...third.items].map(({ id }) => id)).toEqual(inStock.slice(16).concat(sold));
    expect(third.next).toBeNull();
    const scoped = await page(scope);
    await catalogSql("UPDATE variants SET stock=1 WHERE id='sku-stock-page-00'");
    expect((await catalogRequest(after(first))).status).toBe(409);
    expect((await catalogRequest(`page?${scope}&cursor=${encodeURIComponent(scoped.next ?? "")}`)).status).toBe(409);
    expect((await read(query)).items[0].id).toBe(ids[0]);

    await catalogSql("UPDATE catalog_state SET hide_out_of_stock=1 WHERE id=1");
    const hidden = await read(query);
    expect(hidden.count).toBe(20);
    expect(hidden.items.concat((await read(after(hidden))).items).some(({ id }) => id === ids[2])).toBe(false);
  } finally {
    await catalogSql("DELETE FROM products WHERE id LIKE 'stock-page-%'");
    await catalogSql("UPDATE catalog_state SET hide_out_of_stock=0 WHERE id=1");
  }
});
