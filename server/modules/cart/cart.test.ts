import { exports } from "cloudflare:workers";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { cartContract } from "../../../src/shared/contracts/cart";
import { catalogSearchContract, shoppingSearchContract } from "../../../src/shared/contracts/catalog";
import { assertSqlBudget, type SqlMetrics } from "../../metrics";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { beforeFrozenClock } from "../../testing/clock";
import { setupPlatform } from "../../testing/platform";
import { catalogStub, resetShopCatalog, shopCatalogSql } from "../catalog/testing";

beforeFrozenClock();
beforeAll(setupPlatform);
beforeEach(async () => {
  await resetShopCatalog("korzina-demo-test2");
  await sql("DELETE FROM carts");
});
const sql = (query: string) => shopCatalogSql(query, [], "korzina-demo-test2");
const guest = async () => cookieFrom(await postAuth("/api/auth/guest?shop=test2"));
const change = (
  cookie: string,
  quantity: number,
  expectedRevision = 0,
  key = crypto.randomUUID(),
  variantId = "sku-01",
) =>
  postAuth(
    "/api/cart?shop=test2",
    { variantId, quantity, expectedRevision },
    { Cookie: cookie, "Idempotency-Key": key },
  );
const read = async (cookie: string, shop = "test2") =>
  (await getAuth(`/api/cart?shop=${shop}`, { Cookie: cookie })).json().then(cartContract.parse);

it("добавление с плитки сохраняет SKU, серверные деньги и лимит; повтор одной команды не добавляет ещё раз", async () => {
  const cookie = await guest();
  await sql("UPDATE variants SET stock=2 WHERE id='sku-01'");
  const key = crypto.randomUUID();
  const first = await change(cookie, 3, 0, key);
  expect(first.status).toBe(200);
  expect(cartContract.parse(await first.json())).toMatchObject({
    revision: 1,
    count: 2,
    totalMinor: 90000,
    currency: "VND",
    review: { beforeMinor: 135000, changes: [{ variantId: "sku-01", remaining: 2 }] },
    lines: [{ variantId: "sku-01", quantity: 2 }],
  });
  const repeated = await change(cookie, 3, 0, key);
  expect(cartContract.parse(await repeated.json())).toEqual(await read(cookie));
  expect((await change(cookie, 1, 0, key)).status).toBe(409);
  const second = await change(cookie, 1, 1, crypto.randomUUID(), "sku-02");
  expect(cartContract.parse(await second.json())).toMatchObject({ count: 3, totalMinor: 169000 });
  expect((await read(cookie)).lines).toHaveLength(2);
  const removed = await change(cookie, 0, 2);
  expect(cartContract.parse(await removed.json())).toMatchObject({ count: 1, totalMinor: 79000 });
});

it("конкурентные команды проверяют ревизию; неизменившееся количество не меняет её", async () => {
  const cookie = await guest();
  const responses = await Promise.all([change(cookie, 1), change(cookie, 2)]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const current = await read(cookie);
  const conflict = await responses.find((r) => r.status === 409)?.json();
  expect(conflict).toMatchObject({ error: { code: "VERSION_CONFLICT", details: { cart: current } } });
  expect(cartContract.parse(await (await change(cookie, current.count, current.revision)).json())).toEqual(current);
});

it("корзины разделены по покупателю и магазину; скрытый товар не добавляется, цена перечитывается с сервера", async () => {
  const cookie = await guest();
  expect((await change("", 1)).status).toBe(401);
  await (await change(cookie, 1)).arrayBuffer();
  expect((await read(await guest())).count).toBe(0);
  expect((await read(cookie, "lavka")).count).toBe(0);
  await sql("UPDATE variants SET price_minor=12345 WHERE id='sku-01'");
  expect((await read(cookie)).totalMinor).toBe(12345);
  await sql("UPDATE products SET visible=0 WHERE id='product-01'");
  expect((await change(cookie, 2, 1)).status).toBe(409);
  expect((await read(cookie)).lines[0].available).toBe(false);
});

it("изменение корзины ≤4 SQL вместе с проверкой сессии и идемпотентностью, ответ команды — актуальная корзина", async () => {
  const cookie = await guest();
  const response = await catalogStub("korzina-demo-test2").fetch(
    new Request("https://internal/api/cart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        Cookie: cookie,
        "x-korzina-shop": encodeURIComponent(
          JSON.stringify({
            id: "korzina-demo-test2",
            slug: "test2",
            name: "Test",
            status: "active",
            plan: "base",
            createdAt: 0,
          }),
        ),
      },
      body: JSON.stringify({ variantId: "sku-01", quantity: 1, expectedRevision: 0 }),
    }),
  );
  expect(response.status).toBe(200);
  const metrics: SqlMetrics = JSON.parse(response.headers.get("x-korzina-sql") ?? "null");
  assertSqlBudget(metrics, { sql: 4 });
  expect(metrics.transactions).toBe(1);
  expect(cartContract.parse(await response.json())).toEqual(await read(cookie));
  const publicResponse = await exports.default.fetch(
    new Request("https://demo.korzina.app/api/cart?shop=test2", { headers: { Cookie: cookie } }),
  );
  expect(publicResponse.headers.get("Cache-Control")).toBe("no-store");
});

it("одна ревизия пересчёта объединяет цену, остаток и скрытую позицию до явного подтверждения", async () => {
  const cookie = await guest();
  await sql("UPDATE variants SET stock=5 WHERE id='sku-01'");
  expect((await change(cookie, 3)).status).toBe(200);
  expect((await change(cookie, 1, 1, crypto.randomUUID(), "sku-02")).status).toBe(200);
  await sql("UPDATE variants SET stock=2,price_minor=46000 WHERE id='sku-01'");
  await sql("UPDATE variants SET visible=0 WHERE id='sku-02'");
  const result = await read(cookie);
  expect(result).toMatchObject({
    revision: 3,
    totalMinor: 92000,
    adjustments: [],
    review: {
      beforeMinor: 214000,
      changes: [
        { variantId: "sku-01", oldPriceMinor: 45000, remaining: 2 },
        { variantId: "sku-02", unavailable: true },
      ],
    },
    lines: [
      { quantity: 2, totalMinor: 92000 },
      { quantity: 1, available: false, totalMinor: 0 },
    ],
  });
  expect(await read(cookie)).toEqual(result);
  const approve = (expectedRevision: number) =>
    postAuth(
      "/api/cart?shop=test2",
      { confirm: true, expectedRevision },
      { Cookie: cookie, "Idempotency-Key": crypto.randomUUID() },
    );
  expect((await approve(2)).status).toBe(409);
  expect((await approve(3)).status).toBe(200);
  expect(await read(cookie)).toMatchObject({ revision: 4, totalMinor: 92000 });
  expect((await read(cookie)).review).toBeUndefined();
});

it("П2 и §9.3: две фасовки одного товара меняются независимо, закончившуюся можно убрать", async () => {
  const cookie = await guest();
  const secondSku = "sku-02";
  const set = async (quantity: number, revision: number, sku?: string) => {
    const response = await change(cookie, quantity, revision, crypto.randomUUID(), sku);
    expect(response.status).toBe(200);
    return cartContract.parse(await response.json());
  };
  await set(1, 0);
  const both = await set(1, 1, secondSku);
  expect(both.lines).toMatchObject([
    { variantId: "sku-01", quantity: 1 },
    { variantId: secondSku, quantity: 1 },
  ]);
  const increased = await set(2, both.revision);
  const reduced = await set(1, increased.revision);
  expect(reduced.lines).toContainEqual(expect.objectContaining({ variantId: secondSku, quantity: 1 }));
  expect(reduced.lines.filter((line) => line.variantId === "sku-01")).toMatchObject([{ quantity: 1 }]);

  await shopCatalogSql("UPDATE variants SET stock=0 WHERE id=?", [secondSku], "korzina-demo-test2");
  const sold = await read(cookie);
  expect(sold.lines).toContainEqual(expect.objectContaining({ variantId: secondSku, available: false }));
  const rejected = await change(cookie, 2, sold.revision, crypto.randomUUID(), secondSku);
  expect(rejected.status).toBe(409);
  expect(await rejected.json()).toMatchObject({ error: { code: "STOCK_CHANGED" } });
  const remaining = await set(0, sold.revision, secondSku);
  expect(remaining.lines).toMatchObject([{ variantId: "sku-01", quantity: 1 }]);
});

it("П4: поиск, список покупок и подбор блюда сохраняют корзину", async () => {
  const Cookie = await guest();
  const written = await change(Cookie, 1);
  expect(written.status).toBe(200);
  const before = cartContract.parse(await written.json());
  const found = await getAuth("/api/catalog/search?shop=test2&q=%D0%BC%D0%BE%D0%BB%D0%BE%D0%BA%D0%BE", { Cookie });
  expect(found.status).toBe(200);
  expect(catalogSearchContract.parse(await found.json()).items.length).toBeGreaterThan(0);
  const results = await Promise.all(
    ["молоко, томаты", "греческий салат"].map((q) =>
      postAuth("/api/catalog/shopping-search?shop=test2", { q }, { Cookie }),
    ),
  );
  for (const result of results) {
    expect(result.status).toBe(200);
    expect(shoppingSearchContract.parse(await result.json()).groups.length).toBeGreaterThan(1);
  }
  expect(await read(Cookie)).toEqual(before);
});
