import { beforeAll, beforeEach, expect, it } from "vitest";
import { catalogSearchContract } from "../../../src/shared/contracts/catalog";
import { assertSqlBudget } from "../../metrics";
import { setupPlatform } from "../../testing/platform";
import { catalogRequest, catalogSql, resetCatalog } from "./testing";

beforeAll(setupPlatform);
beforeEach(resetCatalog);
const search = async (q: string) => {
  const response = await catalogRequest(`search?q=${encodeURIComponent(q)}`);
  expect(response.status).toBe(200);
  assertSqlBudget(JSON.parse(response.headers.get("x-korzina-sql") ?? "{}"), { sql: 8, rowsWritten: 0 });
  return response.json().then(catalogSearchContract.parse);
};
it("поиск находит регистр, ё/е, опечатку, бренд и категорию; скрытые товары исключены", async () => {
  expect((await search("ТОМАТЫ")).items.some((p) => p.id === "product-01")).toBe(true);
  expect((await search("молко")).suggestion).toBe("молоко");
  expect((await search("Утро")).items.some((p) => p.brandId === "brand-1")).toBe(true);
  expect((await search("Овощи")).items.some((p) => p.categoryId === "home-tomatoes")).toBe(true);
  await catalogSql("UPDATE products SET name='Тёплые томаты' WHERE id='product-01'");
  expect((await search("теплые")).items.some((p) => p.id === "product-01")).toBe(true);
  await catalogSql("UPDATE products SET visible=0 WHERE id='product-01'");
  expect((await search("теплые")).items.some((p) => p.id === "product-01")).toBe(false);
  await catalogSql("UPDATE products SET name='Томаты на ветке',visible=1 WHERE id='product-01'");
  expect((await catalogRequest("search?q=м")).status).toBe(400);
});

it("явный вес выбирает только доступную подходящую фасовку", async () => {
  try {
    await catalogSql("UPDATE variants SET name='1 кг',stock=2,visible=1 WHERE id='sku-01'");
    expect((await search("томаты 1кг")).preferred).toMatchObject({ "product-01": "sku-01" });
    await catalogSql("UPDATE variants SET stock=0 WHERE id='sku-01'");
    expect((await search("томаты 1кг")).preferred).not.toHaveProperty("product-01");
  } finally {
    await catalogSql("UPDATE variants SET name='250 г' WHERE id='sku-01'");
  }
});
