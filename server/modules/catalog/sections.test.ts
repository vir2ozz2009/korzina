import { beforeAll, beforeEach, expect, it } from "vitest";
import { setupPlatform } from "../../testing/platform";
import { cachedDocument } from "./cache";
import { catalogRequest, catalogSql, resetCatalog } from "./testing";

beforeAll(setupPlatform);
beforeEach(resetCatalog);
type Document = {
  catalogVersion: number;
  items: { id: string; categoryId: string; brandId: string | null }[];
  categories: { id: string; hasProducts: boolean }[];
  next: string | null;
};
const read = async (query: string) => (await catalogRequest(`document?${query}`)).json<Document>();

it("родитель включает видимые подкатегории, фильтр и курсор не возвращают соседние товары", async () => {
  await catalogSql("INSERT INTO categories(id,name) VALUES('b3-parent','Родитель')");
  await catalogSql("INSERT INTO categories(id,name,parent_id) VALUES('b3-child','Подкатегория','b3-parent')");
  try {
    await catalogSql("UPDATE products SET category_id='b3-child' WHERE id='product-01'");
    const parent = await read("category=b3-parent&limit=1");
    const child = await read("category=b3-child&limit=1");
    expect(parent.items).toEqual(child.items);
    expect(child.items).toMatchObject([{ id: "product-01", categoryId: "b3-child" }]);
    expect(parent.categories.find((c) => c.id === "b3-parent")?.hasProducts).toBe(true);
    expect((await read(`category=b3-parent&limit=1&after=${parent.items[0].id}`)).items).toEqual([]);
    await catalogSql("UPDATE categories SET visible=0 WHERE id='b3-child'");
    expect((await read("category=b3-parent")).items).toEqual([]);
    expect((await read("category=b3-parent")).categories.find((c) => c.id === "b3-parent")?.hasProducts).toBe(false);
  } finally {
    await catalogSql("UPDATE products SET category_id='home' WHERE id='product-01'");
    await catalogSql("DELETE FROM categories WHERE id='b3-child'");
    await catalogSql("DELETE FROM categories WHERE id='b3-parent'");
  }
});

it("скрытый родитель, бренд и неизвестный раздел недоступны по прямой ссылке; пустой видимый доступен", async () => {
  await catalogSql("INSERT INTO categories(id,name,parent_id) VALUES('b3-child','Подкатегория','home')");
  try {
    expect((await read("category=b3-child")).items).toEqual([]);
    await catalogSql("UPDATE categories SET visible=0 WHERE id='home'");
    await catalogSql("UPDATE brands SET visible=0 WHERE id='brand-1'");
    for (const query of ["category=home", "category=b3-child", "brand=brand-1", "category=missing", "brand=missing"])
      expect((await catalogRequest(`document?${query}`)).status).toBe(404);
  } finally {
    await catalogSql("DELETE FROM categories WHERE id='b3-child'");
  }
});

it("кеш страницы разделён по категории/бренду, курсору и магазину; известная версия не вызывает DO", async () => {
  const request = new Request("https://demo.korzina.app/api/catalog/document");
  let calls = 0;
  const page = (category?: string, brand?: string, after?: string, shop = "sections-a") =>
    cachedDocument(request, { limit: 1, category, brand, after }, "B3-test", shop, () => {
      calls++;
      const query = new URLSearchParams({
        limit: "1",
        ...(category ? { category } : {}),
        ...(brand ? { brand } : {}),
        ...(after ? { after } : {}),
      });
      return catalogRequest(`document?${query}`);
    });
  const first = await page("milk");
  const body = await first.json<Document>();
  await page("milk");
  expect(calls).toBe(1);
  await page("home");
  await page(undefined, "brand-1");
  await page("milk", undefined, "product-01");
  await page("milk", undefined, undefined, "sections-b");
  expect(calls).toBe(5);
  const hit = await cachedDocument(
    request,
    { limit: 1, category: "milk", version: body.catalogVersion },
    "B3-test",
    "sections-a",
    async () => {
      throw new Error("DO on cache hit");
    },
  );
  expect(await hit.json()).toEqual(body);
});
