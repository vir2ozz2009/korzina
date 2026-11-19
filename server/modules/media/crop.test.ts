import { env, exports } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { cartContract } from "../../../src/shared/contracts/cart";
import { catalogListContract, catalogProductContract } from "../../../src/shared/contracts/catalog";
import { newToken, tokenHash } from "../../auth/tokens";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { shopCatalogSql } from "../catalog/testing";

beforeAll(setupPlatform);
const shopId = "korzina-demo-test2";
const sql = (statement: string, ...params: SqlStorageValue[]) => shopCatalogSql(statement, params, shopId);

it("F11: сохраняет кадр владельца для плитки, галереи, корзины и категории с первым товаром или своим фото", async () => {
  const account = crypto.randomUUID();
  const token = newToken();
  await env.PLATFORM.batch([
    env.PLATFORM.prepare("INSERT INTO accounts (id) VALUES (?)").bind(account),
    env.PLATFORM.prepare("INSERT INTO memberships (shop_id,account_id,role) VALUES (?,?,'owner')").bind(
      shopId,
      account,
    ),
    env.PLATFORM.prepare("INSERT INTO seller_sessions (token_hash,account_id,expires_at) VALUES (?,?,?)").bind(
      await tokenHash(token),
      account,
      Date.now() + 100_000,
    ),
  ]);
  const seller = { Authorization: `Bearer ${token}` };
  const customer = { Cookie: cookieFrom(await postAuth("/api/auth/guest?shop=test2")) };
  const bytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVR4nO3OMQEAAAjDsIF/z0MGT2qgmbbNY/s5BwAAAAAAAAAAAAAAAAAASJIDTYgEPEq9nRUAAAAASUVORK5CYII=",
    ),
    (character) => character.charCodeAt(0),
  );
  async function upload() {
    const response = await exports.default.fetch(
      new Request("https://demo.korzina.app/api/media/upload?shop=test2&as=seller&purpose=product", {
        method: "POST",
        headers: { ...seller, "Idempotency-Key": crypto.randomUUID() },
        body: bytes,
      }),
    );
    expect(response.status).toBe(201);
    return await response.json<{ id: string }>();
  }
  const product = await upload();
  const category = await upload();
  const photoPosition = { x: 0.2, y: 0.7 };
  const categoryPosition = { x: 0.8, y: 0.3 };
  const productUrl = `/api/media/${product.id}/state?shop=test2`;
  expect((await postAuth(productUrl, { action: "attach", cropPosition: photoPosition }, customer)).status).toBe(403);
  expect(
    (await postAuth(`${productUrl}&as=seller`, { action: "attach", cropPosition: { x: 2, y: 0 } }, seller)).status,
  ).toBe(400);
  const key = { ...seller, "Idempotency-Key": crypto.randomUUID() };
  const attachment = { action: "attach", cropPosition: photoPosition };
  const attached = await postAuth(`${productUrl}&as=seller`, attachment, key);
  expect(attached.status).toBe(200);
  const saved = await attached.json();
  expect(saved).toMatchObject({
    image: { cropPosition: photoPosition, original: { src: expect.stringContaining("original.webp") } },
  });
  expect(await (await postAuth(`${productUrl}&as=seller`, attachment, key)).json()).toEqual(saved);
  expect(
    (
      await postAuth(
        `/api/media/${category.id}/state?shop=test2&as=seller`,
        { action: "attach", cropPosition: categoryPosition },
        seller,
      )
    ).status,
  ).toBe(200);

  await sql(
    "UPDATE product_photos SET media_id=? WHERE product_id='product-01' AND position=(SELECT min(position) FROM product_photos WHERE product_id='product-01')",
    product.id,
  );
  await sql("UPDATE variants SET photo_id=NULL WHERE id='sku-01'");
  await sql("UPDATE categories SET photo_id=NULL WHERE id='home'");
  await sql("UPDATE categories SET photo_id=? WHERE id='milk'", category.id);
  const document = await (await getAuth("/api/catalog/page?shop=test2&scope=all"))
    .json()
    .then(catalogListContract.parse);
  expect(document.items.find(({ id }) => id === "product-01")?.image?.cropPosition).toEqual(photoPosition);
  expect(document.categories.find(({ id }) => id === "home")?.image?.cropPosition).toEqual(photoPosition);
  expect(document.categories.find(({ id }) => id === "milk")?.image?.cropPosition).toEqual(categoryPosition);
  const detail = await (await getAuth("/api/catalog/products/product-01?shop=test2"))
    .json()
    .then(catalogProductContract.parse);
  expect(detail.images[0].cropPosition).toEqual(photoPosition);
  const cart = await postAuth(
    "/api/cart?shop=test2",
    { variantId: "sku-01", quantity: 1, expectedRevision: 0 },
    customer,
  );
  expect(cartContract.parse(await cart.json()).lines[0].image?.cropPosition).toEqual(photoPosition);

  const center = { x: 0.5, y: 0.5 };
  expect((await postAuth(`${productUrl}&as=seller`, { action: "attach", cropPosition: center }, seller)).status).toBe(
    200,
  );
  const updated = await (await getAuth("/api/catalog/page?shop=test2&scope=all"))
    .json()
    .then(catalogListContract.parse);
  expect(updated.catalogVersion).toBeGreaterThan(document.catalogVersion);
  expect(updated.items.find(({ id }) => id === "product-01")?.image?.cropPosition).toEqual(center);
});
