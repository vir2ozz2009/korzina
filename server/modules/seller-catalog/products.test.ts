import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, expect, it } from "vitest";
import type { OrderResult } from "../../../src/shared/contracts/checkout";
import type {
  SellerProduct,
  SellerProductInput,
  SellerStockConflict,
} from "../../../src/shared/contracts/seller-catalog";
import { cookieFrom, getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { pauseUntil } from "../catalog/sale-pause";
import { catalogSql, resetCatalog } from "../catalog/testing";
import { buy, customer, getQuote, setupCheckout } from "../checkout/testing";

const store = "lavka";
const shop = "korzina-demo-lavka";
const path = (suffix: string, slug = store) =>
  `/api/seller/catalog${suffix}${suffix.includes("?") ? "&" : "?"}store=${slug}`;
const read = async <T>(suffix: string, headers: HeadersInit) => {
  const response = await getAuth(path(suffix), headers);
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json<T>();
};
const write = (suffix: string, input: unknown, headers: Record<string, string>) =>
  postAuth(path(suffix), input, headers);
type Save = { product: SellerProduct; conflicts: SellerStockConflict[]; revision: number };
const draft = (product: SellerProduct): SellerProductInput => ({
  name: product.name,
  description: product.description,
  ingredients: product.ingredients,
  storageNotes: product.storageNotes,
  categoryId: product.categoryId,
  brandId: product.brandId,
  status: product.status,
  recommendations: product.recommendations,
  recommendationIds: product.recommendationIds,
  photos: product.photos.map((photo) => ({ id: photo.id })),
  expectedRevision: product.revision,
  variants: product.variants.map(({ stockRevision, purchased, salePause: _pause, ...variant }) => ({
    ...variant,
    stockBaseline: { stock: variant.stock, revision: stockRevision, purchased },
  })),
});
const target = ({ id, revision }: SellerProduct) => [{ id, revision }];

beforeAll(async () => {
  await setupPlatform();
  await setupCheckout();
});
beforeEach(async () => {
  await resetCatalog();
  await catalogSql("UPDATE products SET sale_pause=NULL WHERE sale_pause IS NOT NULL");
});

it("§11.7 проверяет доступ к текущему магазину и повтор после отзыва", async () => {
  const owner = await sellerFixture(shop);
  const saved = await read<SellerProduct>("/products/product-01", owner.headers);
  expect((await getAuth(path("/products/product-01", "test2"), owner.headers)).status).toBe(403);
  expect((await getAuth(path("/products"))).status).toBe(401);
  const headers = { ...owner.headers, "Idempotency-Key": crypto.randomUUID() };
  const data = { products: target(saved), action: { kind: "show" } };
  const first = await write("/bulk", data, headers);
  expect(first.status, await first.clone().text()).toBe(200);
  expect(await (await write("/bulk", data, headers)).json()).toEqual(await first.json());
  await env.PLATFORM.prepare("UPDATE memberships SET revoked_at=? WHERE shop_id=? AND account_id=?")
    .bind(Date.now(), shop, owner.accountId)
    .run();
  expect((await write("/bulk", data, headers)).status).toBe(403);
});

it("§9.2 §11.1 показывает ноль, 1–5 и скрытые; поиск по скрытым и пагинация не читают полные карточки", async () => {
  const { headers } = await sellerFixture(shop);
  await catalogSql("UPDATE variants SET stock=3 WHERE product_id='product-01'");
  await catalogSql("UPDATE products SET visible=0 WHERE id='product-01'");
  const low = await read<{ revision: number; items: { id: string; status: string; stock: number }[] }>(
    "/products?filter=low_stock",
    headers,
  );
  expect(low.items).toContainEqual(expect.objectContaining({ id: "product-01", status: "hidden", stock: 3 }));
  await catalogSql(`WITH RECURSIVE n(v) AS (SELECT 1 UNION ALL SELECT v+1 FROM n WHERE v<20)
    INSERT INTO products(id,name,category_id) SELECT 'pagination-' || v, 'Полка ' || v, 'home' FROM n`);
  const list = await read<{ items: { id: string }[]; nextCursor: string }>("/products", headers);
  expect(list.items).toHaveLength(16);
  const next = await read<typeof list>(`/products?cursor=${encodeURIComponent(list.nextCursor)}`, headers);
  expect(next.items.some((row) => list.items.some((prior) => prior.id === row.id))).toBe(false);
  await catalogSql("UPDATE products SET visible=1 WHERE id='product-01'");
  await catalogSql("UPDATE variants SET stock=0 WHERE product_id='product-01'");
  const out = await read<typeof low>("/products?filter=out_of_stock&q=том", headers);
  expect(out.items).toContainEqual(expect.objectContaining({ id: "product-01", status: "unavailable" }));
  expect((await getAuth(path(`/products?cursor=${encodeURIComponent(list.nextCursor)}`), headers)).status).toBe(409);
  const search = await read<typeof low>("/products?q=ТОМ&filter=all", headers);
  expect(search.items.some((row) => row.id === "product-01")).toBe(true);
});

it("§9.4 §9.5 покупка меняет версию остатка, остальные поля сохраняются, повторный конфликт защищён", async () => {
  const { headers } = await sellerFixture(shop);
  await catalogSql("UPDATE variants SET stock=10 WHERE id='sku-05'");
  const before = await read<SellerProduct>("/products/product-05", headers);
  const firstBuyer = await customer("sku-05");
  const quote = await getQuote(firstBuyer);
  const placed = await buy("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" }, firstBuyer);
  expect(placed.status, await placed.clone().text()).toBe(201);
  const order = await placed.json<OrderResult>();
  const input = draft(before);
  input.description = "Новое описание";
  input.variants[0].stock = 12;
  input.variants[0].priceMinor += 500;
  const response = await write("/products/product-05", input, headers);
  expect(response.status, await response.clone().text()).toBe(200);
  const saved = await response.json<Save>();
  expect(saved.product).toMatchObject({
    description: input.description,
    variants: expect.arrayContaining([
      expect.objectContaining({ id: "sku-05", stock: 9, priceMinor: input.variants[0].priceMinor }),
    ]),
  });
  expect(saved.conflicts).toMatchObject([{ before: 10, stock: 9, bought: 1 }]);
  const secondBuyer = await customer("sku-05");
  const secondQuote = await getQuote(secondBuyer);
  expect(
    (await buy("checkout", { quoteRevision: secondQuote.quoteRevision, payment: "cash" }, secondBuyer)).status,
  ).toBe(201);
  const tried = await write(
    "/products/product-05/stock",
    [{ id: "sku-05", stock: 12, revision: saved.conflicts[0].revision }],
    headers,
  );
  expect((await tried.json<Save>()).conflicts).toMatchObject([{ stock: 8 }]);
  expect(
    await (await getAuth(`/api/checkout/orders/${order.number}?shop=lavka`, { Cookie: firstBuyer })).json(),
  ).toEqual(order);
});

it("§12.5 §13.1 §13.2 §13.4 пауза сохраняет остаток, старая покупка отклоняется, пачка видит конфликт", async () => {
  const { headers } = await sellerFixture(shop);
  await catalogSql("UPDATE variants SET stock=5 WHERE id IN ('sku-01','sku-05')");
  const before = await read<SellerProduct>("/products/product-01", headers);
  const other = await read<SellerProduct>("/products/product-05", headers);
  const buyer = await customer("sku-01");
  const quote = await getQuote(buyer);
  const paused = await write(
    "/bulk",
    { products: target(before), action: { kind: "pause", duration: "manual" } },
    headers,
  );
  expect(paused.status, await paused.clone().text()).toBe(200);
  expect(await read<SellerProduct>("/products/product-01", headers)).toMatchObject({
    status: "unavailable",
    variants: expect.arrayContaining([expect.objectContaining({ id: "sku-01", stock: 5 })]),
  });
  expect((await buy("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" }, buyer)).status).toBe(409);
  const otherBuyer = cookieFrom(
    await postAuth("/api/auth/contact?shop=lavka", { phone: "+84912345679", confirmed: true }),
  );
  const failed = await buy("cart", { variantId: "sku-01", quantity: 1, expectedRevision: 0 }, otherBuyer);
  expect(failed.status).toBe(409);
  expect(await failed.json()).toMatchObject({ error: { code: "STOCK_CHANGED" } });
  const partial = await write(
    "/bulk",
    { products: [...target(before), ...target(other)], action: { kind: "hide" } },
    headers,
  );
  expect(await partial.json()).toMatchObject({
    applied: [other.id],
    failed: [{ id: before.id, code: "VERSION_CONFLICT" }],
  });
  expect((await getAuth("/api/catalog/products/product-05?shop=lavka")).status).toBe(404);
  expect(pauseUntil("tomorrow", Date.parse("2026-11-20T19:00:00Z"), "Europe/Moscow")).toBe(
    Date.parse("2026-11-20T21:00:00Z"),
  );
});

it("§9.6 §11.5 §12.7 §13.3 §13.5 сохраняет ручной порядок; скрытые рекомендации исключаются, копия скрыта", async () => {
  const { headers } = await sellerFixture(shop);
  await catalogSql("UPDATE products SET visible=1 WHERE id IN ('product-01','product-05','product-09')");
  await catalogSql("UPDATE variants SET stock=10 WHERE id IN ('sku-01','sku-05','sku-09')");
  const before = await read<SellerProduct>("/products/product-01", headers);
  const input = {
    ...draft(before),
    categoryId: null,
    recommendations: "manual",
    recommendationIds: ["product-09", "product-05"],
  };
  const duplicate = await write(
    "/products/product-01",
    {
      ...input,
      variants: [
        { ...input.variants[0], name: " Упаковка " },
        { ...input.variants[0], id: undefined, name: "упаковка" },
      ],
    },
    headers,
  );
  expect(await duplicate.json()).toMatchObject({ error: { code: "DUPLICATE_VARIANT_NAME" } });
  const response = await write("/products/product-01", input, headers);
  expect(response.status, await response.clone().text()).toBe(200);
  const { product: updated } = await response.json<Save>();
  const storefront = async () =>
    (await getAuth("/api/catalog/products/product-01?shop=lavka")).json<{
      recommendations: { items: { id: string }[] };
    }>();
  expect((await storefront()).recommendations.items.map((item) => item.id)).toEqual(["product-09", "product-05"]);
  const third = await read<SellerProduct>("/products/product-09", headers);
  await write("/bulk", { products: target(third), action: { kind: "hide" } }, headers);
  expect((await storefront()).recommendations.items.map((item) => item.id)).toEqual(["product-05"]);
  const copied = await write("/products/product-01/copy", { revision: updated.revision }, headers);
  expect(copied.status, await copied.clone().text()).toBe(200);
  expect((await copied.json<Save>()).product).toMatchObject({
    status: "hidden",
    categoryId: null,
    photos: updated.photos,
    recommendationIds: input.recommendationIds,
    variants: expect.arrayContaining([expect.objectContaining({ stock: 10 })]),
  });
  expect((await read<{ items: { id: string }[] }>("/products?filter=uncategorized", headers)).items).toContainEqual(
    expect.objectContaining({ id: before.id }),
  );
});

it("§9.3 §11.8 удаление товара оставляет снимок заказа и его фото после срока уборки", async () => {
  const { headers } = await sellerFixture(shop);
  const id = crypto.randomUUID();
  await catalogSql(
    `INSERT INTO media(id,owner,purpose,status,ready,bytes,mime,request_key,fingerprint,created_at)
    VALUES(?,'test','product','attached',1,30,'image/webp',?,'local',?)`,
    id,
    id,
    Date.now(),
  );
  await catalogSql("UPDATE product_photos SET media_id=? WHERE product_id='product-13'", id);
  await catalogSql("UPDATE variants SET stock=5 WHERE id='sku-13'");
  const product = await read<SellerProduct>("/products/product-13", headers);
  const buyer = await customer("sku-13");
  const quote = await getQuote(buyer);
  const placed = await buy("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" }, buyer);
  expect(placed.status).toBe(201);
  const order = await placed.json<OrderResult>();
  expect(order.lines[0].image?.original.src).toContain(id);
  const response = await write("/bulk", { products: target(product), action: { kind: "delete" } }, headers);
  expect(await response.json()).toMatchObject({ applied: [product.id], failed: [] });
  expect((await getAuth("/api/catalog/products/product-13?shop=lavka")).status).toBe(404);
  expect(await catalogSql("SELECT expires_at FROM media WHERE id=?", id)).toEqual([{ expires_at: null }]);
  expect(await (await getAuth(`/api/checkout/orders/${order.number}?shop=lavka`, { Cookie: buyer })).json()).toEqual(
    order,
  );
});
