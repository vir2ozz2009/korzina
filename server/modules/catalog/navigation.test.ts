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
  const before = await (await catalogRequest("document?limit=1")).json<Document>();
  expect(before.categories.find((c) => c.id === "milk")?.image?.src).toContain("milk-");
  await catalogSql("UPDATE categories SET photo_id='demo-curd' WHERE id='milk'");
  await catalogSql("UPDATE brands SET photo_id='demo-milk' WHERE id='brand-1'");
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
    image: { src: expect.stringContaining("milk-") },
  });
  await catalogSql("UPDATE products SET visible=0 WHERE category_id='milk'");
  const hidden = await (await catalogRequest("document?limit=1")).json<Document>();
  expect(hidden.categories.find((c) => c.id === "milk")?.hasProducts).toBe(false);
});
it("внешние demo-фото сохраняют URL; удалённые и скрытые SKU не делают раздел непустым", async () => {
  await catalogSql("UPDATE variants SET visible=0 WHERE product_id='product-01'");
  const page = await (await catalogRequest("document")).json<Document>();
  const cucumber = page.items.find((item) => item.id === "product-25");
  expect(cucumber?.image.src).toBe("/seed/cucumber-400.webp");
  expect(cucumber?.image.original.src).toBe("/seed/cucumber-1200.webp");
  for (const item of page.items.filter((product) => product !== cucumber)) {
    expect(item.image.src).toMatch(/^https:\/\/media\.demo\.korzina\.app\//);
    expect(item.image.srcSet).toContain("https://media.demo.korzina.app/");
    expect(item.image.original.src).toMatch(/^https:\/\/media\.demo\.korzina\.app\//);
  }
  await catalogSql(
    "UPDATE variants SET visible=0 WHERE product_id IN (SELECT id FROM products WHERE category_id='home' OR category_id IN (SELECT id FROM categories WHERE parent_id='home'))",
  );
  const hidden = await (await catalogRequest("document")).json<Document>();
  expect(hidden.categories.find((c) => c.id === "home")?.hasProducts).toBe(false);
  await catalogSql("UPDATE categories SET photo_id=NULL WHERE id='milk'");
  await catalogSql("UPDATE brands SET photo_id=NULL WHERE id='brand-1'");
});
