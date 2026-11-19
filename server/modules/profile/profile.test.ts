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

it("адрес профиля выбирается в корзине, удаление сохраняет выбранную копию и профили изолированы", async () => {
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
    { receiving, expectedRevision: update.revision },
    { Cookie: owner },
  );
  expect(select.status).toBe(200);
  expect((await postAuth(path, { action: "remove", revision: update.revision, id }, { Cookie: owner })).status).toBe(
    409,
  );
  const remove = await postAuth(
    path,
    { action: "remove", revision: (await read(owner)).revision, id },
    { Cookie: owner },
  );
  expect(remove.status).toBe(200);
  expect(await (await getAuth("/api/receiving?shop=lavka", { Cookie: owner })).json()).toMatchObject({
    receiving,
    savedAddresses: [],
  });
});
