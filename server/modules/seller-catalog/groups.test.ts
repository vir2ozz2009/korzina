import { beforeAll, expect, it } from "vitest";
import { categoryMosaic } from "../../../src/shared/catalog/mosaic";
import type { SellerGroup, SellerGroupInput } from "../../../src/shared/contracts/seller-catalog";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";
import { buy, customer, getQuote, setupCheckout } from "../checkout/testing";

const store = "lavka";
const path = (suffix: string) => `/api/seller/catalog${suffix}?store=${store}`;
const base = (name: string, parentId: string | null = null): SellerGroupInput => ({
  visible: true,
  name,
  parentId,
  photo: null,
});
const seller = () => sellerFixture("korzina-demo-lavka");
const write = (suffix: string, input: unknown, headers: Record<string, string>) =>
  postAuth(path(suffix), input, headers);
const list = async (headers: HeadersInit) =>
  (await getAuth(path("/groups/categories"), headers)).json<{ groups: SellerGroup[] }>();
const create = async (type: "brands" | "categories", input: SellerGroupInput, headers: Record<string, string>) => {
  const response = await write(`/groups/${type}`, input, headers);
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json<{ group: SellerGroup }>()).group;
};

beforeAll(async () => {
  await setupPlatform();
  await setupCheckout();
});

it("§11.3 скрытая группа и подкатегория исчезают из входов, товар находится и покупается", async () => {
  const { headers } = await seller();
  const root = await create("categories", base("Морозильная камера"), headers);
  const child = await create("categories", base("Летнее хранение", root.id), headers);
  const brand = await create("brands", base("Холодный склад"), headers);
  await catalogSql("UPDATE products SET category_id=?,brand_id=? WHERE id='product-01'", child.id, brand.id);
  await catalogSql("UPDATE variants SET stock=9 WHERE id='sku-01'");
  const disable = (group: SellerGroup, kind: string) =>
    write(
      `/groups/${kind}/${group.id}`,
      { ...base(group.name, group.parentId), visible: false, expectedRevision: group.revision },
      headers,
    );
  expect((await disable(root, "categories")).status).toBe(200);
  expect((await disable(brand, "brands")).status).toBe(200);
  const read = async (suffix: string) =>
    (await getAuth(`/api/catalog/${suffix}${suffix.includes("?") ? "&" : "?"}shop=${store}`)).json<{
      items: { id: string }[];
      categories: { id: string }[];
      brands: { id: string }[];
    }>();
  const result = await read("search?q=томаты");
  expect(result.categories.some((row) => row.id === root.id || row.id === child.id)).toBe(false);
  expect(result.brands.some((row) => row.id === brand.id)).toBe(false);
  expect(result.items.some((row) => row.id === "product-01")).toBe(true);
  expect((await read(`search?q=томаты&cat=${child.id}`)).items).toEqual([]);
  expect((await read("search?q=хранение")).items.some((row) => row.id === "product-01")).toBe(false);
  const buyer = await customer("sku-01");
  const quote = await getQuote(buyer);
  expect((await buy("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" }, buyer)).status).toBe(201);
});

it("§9.3 §11.4 §12.4 удаление дерева переносит все товары атомарно; бренд можно снять", async () => {
  const { headers } = await seller();
  const root = await create("categories", base("Родитель для переноса"), headers);
  const child = await create("categories", base("Подкатегория", root.id), headers);
  const brand = await create("brands", base("Бренд для переноса"), headers);
  await catalogSql("UPDATE products SET category_id=?,brand_id=? WHERE id='product-05'", root.id, brand.id);
  await catalogSql("UPDATE products SET category_id=?,brand_id=? WHERE id='product-09'", child.id, brand.id);
  const remove = (transferTo?: string | null) =>
    write(`/groups/categories/${root.id}/delete`, { revision: root.revision, transferTo }, headers);
  expect(await (await remove()).json()).toMatchObject({ error: { code: "NOT_EMPTY" } });
  expect((await remove(child.id)).status).toBe(400);
  expect(await (await remove(null)).json()).toMatchObject({ transferred: 2 });
  expect(
    await (
      await write(`/groups/brands/${brand.id}/delete`, { revision: brand.revision, transferTo: null }, headers)
    ).json(),
  ).toMatchObject({ transferred: 2 });
  expect((await list(headers)).groups.some((row) => row.id === child.id || row.id === root.id)).toBe(false);
  const search = await getAuth("/api/catalog/search?q=голубика&shop=lavka");
  expect(await search.json()).toMatchObject({ items: [{ id: "product-05", brandId: null }] });
});

it("§12.2 сохранённые размер и порядок приходят в ответ витрины; устаревшая команда отклоняется", async () => {
  const { headers } = await seller();
  const { groups } = await list(headers);
  const seen = groups.filter((row) => row.parentId === null && row.onStorefront && row.hasStorefrontProducts);
  expect(seen.length).toBeGreaterThan(1);
  const categories = [...seen]
    .reverse()
    .map(({ id, revision }, index) => ({ id, revision, tileSize: index === 0 ? "2x2" : "1x1" }));
  const action = { parentId: null, mosaic: true, categories };
  const response = await write("/category-order", action, headers);
  expect(response.status, await response.clone().text()).toBe(200);
  expect((await write("/category-order", action, headers)).status).toBe(409);
  const { categories: publicGroups } = await (await getAuth("/api/catalog/document?shop=lavka")).json<{
    categories: { id: string; tileSize: "1x1" | "2x2"; hasProducts: boolean; parentId: string | null }[];
  }>();
  const visible = publicGroups.filter((row) => !row.parentId && row.hasProducts);
  expect(visible.map((row) => row.id)).toEqual(categories.map((row) => row.id));
  expect(categoryMosaic(visible)[0]).toMatchObject({ size: "2x2", column: 1, row: 1 });
});
