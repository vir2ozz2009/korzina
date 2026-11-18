import { exports } from "cloudflare:workers";
import { beforeAll, beforeEach, expect, it } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import { assertSqlBudget } from "../../metrics";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, catalogStub, resetCatalog } from "../catalog/testing";

beforeAll(setupPlatform);
beforeEach(async () => {
  await resetCatalog();
  await catalogSql("DELETE FROM carts");
});
const guest = async () => cookieFrom(await postAuth("/api/auth/guest?shop=lavka"));
const change = (
  cookie: string,
  quantity: number,
  expectedRevision = 0,
  key = crypto.randomUUID(),
  variantId = "sku-01",
) =>
  postAuth(
    "/api/cart?shop=lavka",
    { variantId, quantity, expectedRevision },
    { Cookie: cookie, "Idempotency-Key": key },
  );
const read = async (cookie: string, shop = "lavka") =>
  (await getAuth(`/api/cart?shop=${shop}`, { Cookie: cookie })).json<Cart>();

it("добавление с плитки сохраняет SKU, серверные деньги и лимит; повтор одной команды не добавляет ещё раз", async () => {
  const cookie = await guest();
  await catalogSql("UPDATE variants SET stock=2 WHERE id='sku-01'");
  const key = crypto.randomUUID();
  const first = await change(cookie, 3, 0, key);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({
    revision: 1,
    count: 2,
    totalMinor: 90000,
    currency: "VND",
    review: { beforeMinor: 135000, changes: [{ variantId: "sku-01", remaining: 2 }] },
    lines: [{ variantId: "sku-01", quantity: 2 }],
  });
  const repeated = await change(cookie, 3, 0, key);
  expect(await repeated.json()).toEqual(await read(cookie));
  expect((await change(cookie, 1, 0, key)).status).toBe(409);
  const second = await change(cookie, 1, 1, crypto.randomUUID(), "sku-02");
  expect(await second.json()).toMatchObject({ count: 3, totalMinor: 169000 });
  expect((await read(cookie)).lines).toHaveLength(2);
  const removed = await change(cookie, 0, 2);
  expect(await removed.json()).toMatchObject({ count: 1, totalMinor: 79000 });
});

it("конкурентные команды проверяют ревизию; неизменившееся количество не меняет её", async () => {
  const cookie = await guest();
  const responses = await Promise.all([change(cookie, 1), change(cookie, 2)]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const current = await read(cookie);
  const conflict = await responses.find((r) => r.status === 409)?.json();
  expect(conflict).toMatchObject({ error: { code: "VERSION_CONFLICT", details: { cart: current } } });
  expect(await (await change(cookie, current.count, current.revision)).json()).toEqual(current);
});

it("корзины разделены по покупателю и магазину; скрытый товар не добавляется, цена перечитывается с сервера", async () => {
  const cookie = await guest();
  expect((await change("", 1)).status).toBe(401);
  await (await change(cookie, 1)).arrayBuffer();
  expect((await read(await guest())).count).toBe(0);
  expect((await read(cookie, "test2")).count).toBe(0);
  await catalogSql("UPDATE variants SET price_minor=12345 WHERE id='sku-01'");
  expect((await read(cookie)).totalMinor).toBe(12345);
  await catalogSql("UPDATE products SET visible=0 WHERE id='product-01'");
  expect((await change(cookie, 2, 1)).status).toBe(409);
  expect((await read(cookie)).lines[0].available).toBe(false);
});

it("изменение корзины ≤4 SQL вместе с проверкой сессии и идемпотентностью, ответ команды — актуальная корзина", async () => {
  const cookie = await guest();
  const response = await catalogStub().fetch(
    new Request("https://internal/api/cart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        Cookie: cookie,
        "x-korzina-shop": encodeURIComponent(
          JSON.stringify({
            id: "korzina-demo-lavka",
            slug: "lavka",
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
  assertSqlBudget(JSON.parse(response.headers.get("x-korzina-sql") ?? "null"), { sql: 4 });
  expect(await response.json()).toEqual(await read(cookie));
  const publicResponse = await exports.default.fetch(
    new Request("https://demo.korzina.app/api/cart?shop=lavka", { headers: { Cookie: cookie } }),
  );
  expect(publicResponse.headers.get("Cache-Control")).toBe("no-store");
});

it("одна ревизия пересчёта объединяет цену, остаток и скрытую позицию до явного подтверждения", async () => {
  const cookie = await guest();
  await catalogSql("UPDATE variants SET stock=5 WHERE id='sku-01'");
  expect((await change(cookie, 3)).status).toBe(200);
  expect((await change(cookie, 1, 1, crypto.randomUUID(), "sku-02")).status).toBe(200);
  await catalogSql("UPDATE variants SET stock=2,price_minor=46000 WHERE id='sku-01'");
  await catalogSql("UPDATE variants SET visible=0 WHERE id='sku-02'");
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
      "/api/cart?shop=lavka",
      { confirm: true, expectedRevision },
      { Cookie: cookie, "Idempotency-Key": crypto.randomUUID() },
    );
  expect((await approve(2)).status).toBe(409);
  expect((await approve(3)).status).toBe(200);
  expect(await read(cookie)).toMatchObject({ revision: 4, totalMinor: 92000 });
  expect((await read(cookie)).review).toBeUndefined();
});
