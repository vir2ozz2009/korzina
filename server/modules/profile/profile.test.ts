import { beforeAll, expect, it } from "vitest";
import type { SavedAddress } from "../../../src/shared/contracts/profile";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";

beforeAll(setupPlatform);

async function login() {
  const response = await postAuth("/api/auth/contact?shop=lavka", { phone: "+84912345678", confirmed: true });
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

it("§9.4 адрес профиля выбирается в корзине, удаление сохраняет выбранную копию и профили изолированы", async () => {
  await catalogSql(
    "INSERT OR REPLACE INTO settings(key,value) VALUES('fulfillment',?)",
    JSON.stringify({ delivery: { mode: "text", tariff: { kind: "free" } }, requiredDetails: ["apartment"] }),
  );
  const owner = await login();
  const other = await login();
  const path = "/api/profile/addresses?shop=lavka";
  const read = async (Cookie: string) =>
    (await getAuth(path, { Cookie })).json<{ revision: number; addresses: SavedAddress[] }>();
  const receiving = { mode: "delivery", address: "28 Lê Lợi", apartment: "8" };
  const before = await read(owner);
  const add = { action: "save", revision: before.revision, title: "Дом", receiving };
  const saved = await postAuth(path, add, { Cookie: owner });
  expect(saved.status).toBe(200);
  const { revision: cartRevision } = await saved.json<{ revision: number }>();
  const update = await read(owner);
  const id = update.addresses[0].id;
  expect(update.addresses).toMatchObject([{ title: "Дом", ...receiving }]);
  expect((await read(other)).addresses).toEqual([]);
  const unauthorized = await postAuth(
    path,
    { action: "remove", revision: (await read(other)).revision, id },
    { Cookie: other },
  );
  expect(unauthorized.status).toBe(404);
  const select = await postAuth(
    "/api/receiving?shop=lavka",
    { receiving, expectedRevision: cartRevision },
    { Cookie: owner },
  );
  expect(select.status).toBe(200);
  const remove = await postAuth(path, { action: "remove", revision: update.revision, id }, { Cookie: owner });
  expect(remove.status).toBe(200);
  expect(await (await getAuth("/api/receiving?shop=lavka", { Cookie: owner })).json()).toMatchObject({
    receiving,
    savedAddresses: [],
  });
});

it("§9.4 · изменение корзины не отменяет сохранение адреса, реальное изменение списка защищено", async () => {
  await catalogSql(
    "INSERT OR REPLACE INTO settings(key,value) VALUES('fulfillment',?)",
    JSON.stringify({ delivery: { mode: "text", tariff: { kind: "free" } } }),
  );
  const Cookie = await login();
  const path = "/api/profile/addresses?shop=lavka";
  const read = async () => (await getAuth(path, { Cookie })).json<{ revision: number; addresses: SavedAddress[] }>();
  const cart = async () => (await getAuth("/api/cart?shop=lavka", { Cookie })).json<{ revision: number }>();
  const before = await read();
  const addToCart = await postAuth(
    "/api/cart?shop=lavka",
    { variantId: "sku-01", quantity: 1, expectedRevision: (await cart()).revision },
    { Cookie },
  );
  expect(addToCart.status).toBe(200);
  expect(await read()).toEqual(before);

  const save = {
    action: "save",
    revision: before.revision,
    title: "Работа",
    receiving: { mode: "delivery", address: "45 Lê Lợi", apartment: "7" },
  };
  const saved = await postAuth(path, save, { Cookie });
  expect(saved.status).toBe(200);
  const address = await read();
  expect(address.addresses).toMatchObject([{ title: "Работа" }]);
  expect(await cart()).toMatchObject({
    revision: address.revision,
    lines: [{ variantId: "sku-01", quantity: 1 }],
  });
  const conflicting = await postAuth(path, { ...save, id: address.addresses[0].id, title: "Изменение" }, { Cookie });
  expect(conflicting.status).toBe(409);
  expect(await conflicting.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
  expect(await read()).toEqual(address);
});

it("§9.4, §9.5 сохраняет ровно 10 адресов, одиннадцатый не мешает оформить заказ", async () => {
  await catalogSql(
    "INSERT OR REPLACE INTO settings(key,value) VALUES('fulfillment',?),('receiving_schedule',?),('purchase_payment',?)",
    JSON.stringify({ delivery: { mode: "text", tariff: { kind: "free" } }, requiredDetails: [] }),
    JSON.stringify({ timeZone: "Asia/Ho_Chi_Minh", delivery: { mode: "after_order", days: {} } }),
    JSON.stringify({ methods: ["cash"], minimumMinor: 0 }),
  );
  await catalogSql("UPDATE variants SET stock=5 WHERE id='sku-01'");
  const Cookie = await login();
  const buy = (path: string, body: object) => postAuth(`/api/${path}?shop=lavka`, body, { Cookie });
  const read = async () =>
    (await getAuth("/api/profile/addresses?shop=lavka", { Cookie })).json<{
      revision: number;
      addresses: SavedAddress[];
    }>();
  const address = (number: number) => ({ mode: "delivery", address: `ул. Ле Лой, ${number}` });
  let current = await read();
  for (let number = 1; number <= 10; number++) {
    const saved = await buy("profile/addresses", {
      action: "save",
      revision: current.revision,
      title: `Адрес ${number}`,
      receiving: address(number),
    });
    expect(saved.status).toBe(200);
    current = await saved.json<typeof current>();
  }
  expect(current.addresses).toHaveLength(10);
  const blocked = await buy("profile/addresses", {
    action: "save",
    revision: current.revision,
    title: "Одиннадцатый",
    receiving: address(11),
  });
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toMatchObject({ error: { code: "ADDRESS_LIMIT" } });
  expect(await read()).toEqual(current);

  const cart = await buy("cart", { variantId: "sku-01", quantity: 1, expectedRevision: current.revision });
  expect(cart.status).toBe(200);
  const { revision } = await cart.json<{ revision: number }>();
  expect((await buy("receiving", { receiving: address(11), expectedRevision: revision, complete: true })).status).toBe(
    200,
  );
  const quote = await buy("quote", {});
  expect(quote.status).toBe(200);
  const { quoteRevision } = await quote.json<{ quoteRevision: string }>();
  const order = await buy("checkout", { quoteRevision, payment: "cash" });
  expect(order.status).toBe(201);
  expect(await order.json()).toMatchObject({ receiving: address(11) });
  expect(await read()).toMatchObject({ revision: current.revision, addresses: current.addresses });
});
