import { exports } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { shoppingSearchContract } from "../../../src/shared/contracts/catalog";
import { readShoppingSearch } from "../../../src/shared/shopping-search";
import { assertSqlBudget } from "../../metrics";
import { setupPlatform } from "../../testing/platform";

beforeAll(setupPlatform);

function search(q: string) {
  return exports.default.fetch(
    new Request("https://demo.korzina.app/api/catalog/shopping-search?shop=test2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q }),
    }),
  );
}

it("разбирает список с запятыми и переносами, сохраняя запятую внутри веса", () => {
  expect(readShoppingSearch("молоко, хлеб\nтоматы 0,5 кг")).toEqual({
    kind: "list",
    parts: ["молоко", "хлеб", "томаты 0,5 кг"],
  });
  expect(readShoppingSearch(Array(41).fill("молоко").join(","))).toMatchObject({ kind: "error" });
  expect(readShoppingSearch("я".repeat(4001))).toMatchObject({ kind: "error" });
});

it("возвращает найденные и неизвестные позиции одним запросом, включая точный вес", async () => {
  const response = await search("молоко 500 мл, томаты\nнеизвестнаяпозиция");
  expect(response.status).toBe(200);
  const data = await response.json().then(shoppingSearchContract.parse);
  expect(data.groups.map(({ term }) => term)).toEqual(["молоко 500 мл", "томаты", "неизвестнаяпозиция"]);
  expect(data.groups[0].preferred).toEqual({ "product-13": "sku-13" });
  expect(data.groups[1].ids).toContain("product-01");
  expect(data.groups[2].ids).toEqual([]);
  assertSqlBudget(JSON.parse(response.headers.get("x-korzina-sql") ?? "{}"), { sql: 12, rowsWritten: 0 });
  expect((await search(Array(41).fill("молоко").join(","))).status).toBe(400);
});

it("подбирает опубликованные ингредиенты греческого салата", async () => {
  const response = await search("Греческий салат");
  expect(response.status).toBe(200);
  const { items } = await response.json().then(shoppingSearchContract.parse);
  expect(items.some((item) => /томаты/i.test(item.name))).toBe(true);
  expect(items.some((item) => /огурцы/i.test(item.name))).toBe(true);
  expect(items.every((item) => /томаты|огурцы|сладкий перец|красный лук|оливки|фета/i.test(item.name))).toBe(true);
});
