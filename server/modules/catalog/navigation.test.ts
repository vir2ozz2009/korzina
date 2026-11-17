import { beforeAll, beforeEach, expect, it } from "vitest";
import { setupPlatform } from "../../testing/platform";
import { catalogRequest, catalogSql, resetCatalog } from "./testing";

beforeAll(setupPlatform);
beforeEach(resetCatalog);
type Document = {
  categories: { id: string; hasProducts: boolean; image: { src: string } | null }[];
  brands: { id: string; hasProducts: boolean; image: { src: string } | null }[];
  items: { id: string; image: { src: string; srcSet: string; original: { src: string } } }[];
};
it("непустые категории/бренды и их фото не зависят от страницы товаров; своё фото имеет приоритет", async () => {
  await catalogSql("UPDATE categories SET photo_id='demo-curd' WHERE id='milk'");
  await catalogSql("UPDATE brands SET photo_id='demo-curd' WHERE id='brand-1'");
  const page = await (await catalogRequest("document?limit=1")).json<Document>();
  const full = await (await catalogRequest("document")).json<Document>();
  expect(page.categories).toEqual(full.categories);
  expect(page.brands).toEqual(full.brands);
  expect(page.categories.find((c) => c.id === "milk")).toMatchObject({
    hasProducts: true,
    image: { src: expect.stringContaining("tomato-") },
  });
  expect(page.brands.find((b) => b.id === "brand-1")).toMatchObject({
    hasProducts: true,
    image: { src: expect.stringContaining("tomato-") },
  });
  await catalogSql("UPDATE products SET visible=0 WHERE category_id='milk'");
  const hidden = await (await catalogRequest("document?limit=1")).json<Document>();
  expect(hidden.categories.find((c) => c.id === "milk")?.hasProducts).toBe(false);
});
it("кешируемые изображения — пути; удалённые и скрытые SKU не делают раздел непустым", async () => {
  await catalogSql("UPDATE variants SET visible=0 WHERE product_id='product-01'");
  const page = await (await catalogRequest("document")).json<Document>();
  for (const item of page.items) {
    expect(item.image.src).toMatch(/^\//);
    expect(item.image.srcSet).not.toContain("https://");
    expect(item.image.original.src).toMatch(/^\//);
  }
  await catalogSql(
    "UPDATE variants SET visible=0 WHERE product_id IN (SELECT id FROM products WHERE category_id='home')",
  );
  const hidden = await (await catalogRequest("document")).json<Document>();
  expect(hidden.categories.find((c) => c.id === "home")?.hasProducts).toBe(false);
  await catalogSql("UPDATE categories SET photo_id=NULL WHERE id='milk'");
  await catalogSql("UPDATE brands SET photo_id=NULL WHERE id='brand-1'");
});
