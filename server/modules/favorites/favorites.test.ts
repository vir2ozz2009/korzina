import { beforeAll, expect, it } from "vitest";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";

beforeAll(setupPlatform);

async function account() {
  const result = await postAuth("/api/auth/contact?shop=lavka", { phone: "+84912345678", confirmed: true });
  expect(result.status).toBe(200);
  return cookieFrom(result);
}

it("слияние избранного не дублирует товар и изолирует профили устройств", async () => {
  const [a, b] = await Promise.all([account(), account()]);
  const path = "/api/favorites/merge?shop=lavka";
  const key = crypto.randomUUID();
  const write = () =>
    postAuth(path, { ids: ["product-01", "product-01", "product-02"] }, { Cookie: a, "Idempotency-Key": key });
  expect(await (await write()).json()).toEqual({ ids: ["product-01", "product-02"] });
  expect(await (await write()).json()).toEqual({ ids: ["product-01", "product-02"] });
  expect(await (await getAuth("/api/favorites?shop=lavka", { Cookie: b })).json()).toEqual({ ids: [] });
  expect((await getAuth("/api/favorites?shop=lavka")).status).toBe(401);
});
