import { beforeAll, beforeEach, expect, it } from "vitest";
import { getAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { buy, customer, getQuote, setupCheckout } from "./testing";

beforeAll(setupPlatform);
beforeEach(setupCheckout);

it("CART-CLARITY П7/А9–А10: новый заказ после самовывоза и повтор старого checkout", async () => {
  const cookie = await customer("sku-01");
  const quote = await getQuote(cookie);
  const key = crypto.randomUUID();
  const input = { quoteRevision: quote.quoteRevision, payment: "cash" };
  expect((await buy("checkout", input, cookie, key)).status).toBe(201);
  const read = async () =>
    (await getAuth("/api/receiving?shop=lavka", { Cookie: cookie })).json<{
      revision: number;
      effectiveMode: string;
    }>();
  const next = await read();
  expect(next).toMatchObject({ effectiveMode: "delivery", receiving: null });
  expect(
    (await buy("receiving", { expectedRevision: next.revision, receiving: { mode: "pickup" } }, cookie)).status,
  ).toBe(200);
  expect((await buy("checkout", input, cookie, key)).status).toBe(201);
  expect(await read()).toMatchObject({ effectiveMode: "pickup", explicitMode: "pickup" });
});
