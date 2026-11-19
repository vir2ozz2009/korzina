import { beforeAll, beforeEach, expect, it } from "vitest";
import type { OrderResult } from "../../../src/shared/contracts/checkout";
import { getAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";
import { buy, customer, getQuote, setupCheckout } from "./testing";

beforeAll(setupPlatform);
beforeEach(setupCheckout);

it("отмена покупателя освобождает остаток один раз, закрывает активный заказ и сохраняет историю", async () => {
  await catalogSql("UPDATE variants SET stock=2 WHERE id='sku-01'");
  const owner = await customer("sku-01");
  const stranger = await customer("sku-02");
  const quote = await getQuote(owner);
  const placed = await buy("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" }, owner);
  expect(placed.status).toBe(201);
  const { number } = await placed.json<OrderResult>();
  const get = (path: string, cookie = owner) =>
    getAuth(`/api/orders${path}${path.includes("?") ? "&" : "?"}shop=lavka`, { Cookie: cookie });
  expect((await get(`/${number}`, stranger)).status).toBe(404);
  const active = await get("/active");
  expect(await active.json()).toMatchObject({ data: { count: 1, orders: [{ number, stage: "placed" }] } });
  const badge = active.headers.get("etag");
  const unchanged = await getAuth("/api/orders/active?shop=lavka", { Cookie: owner, "If-None-Match": badge ?? "" });
  expect(unchanged.status).toBe(304);
  const key = crypto.randomUUID();
  const cancel = () => buy(`orders/${number}/cancel`, { expectedVersion: 0 }, owner, key);
  const cancelled = await cancel();
  expect(await cancelled.json()).toMatchObject({ number, stage: "cancelled", version: 1, canCancel: false });
  expect((await cancel()).status).toBe(200);
  expect(await catalogSql("SELECT stock FROM variants WHERE id='sku-01'")).toEqual([{ stock: 2 }]);
  expect(await (await get("/active")).json()).toMatchObject({ data: { count: 0 } });
  expect(await (await get("?tab=completed")).json()).toMatchObject({ orders: [{ number, stage: "cancelled" }] });
});

it("повтор блокирует изменившуюся цену и добавляет доступное количество поверх корзины один раз", async () => {
  await catalogSql("UPDATE variants SET stock=5,price_minor=100000 WHERE id='sku-01'");
  const owner = await customer("sku-01");
  const quote = await getQuote(owner);
  const { number } = await (
    await buy("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" }, owner)
  ).json<OrderResult>();
  const path = `orders/${number}/repeat`;
  const preview = async () =>
    (await getAuth(`/api/${path}?shop=lavka`, { Cookie: owner })).json<{
      check: string;
      expectedCartRevision: number;
      lines: { priceMinor: number }[];
    }>();
  const command = (data: Awaited<ReturnType<typeof preview>>, key?: string) =>
    buy(path, { expectedCartRevision: data.expectedCartRevision, check: data.check }, owner, key);
  const before = await preview();
  await catalogSql("UPDATE variants SET price_minor=130000 WHERE id='sku-01'");
  expect((await command(before)).status).toBe(409);
  const after = await preview();
  expect(after.lines[0]?.priceMinor).toBe(130000);
  const key = crypto.randomUUID();
  expect(await (await command(after, key)).json()).toMatchObject({ cart: { count: 1 } });
  expect(await (await command(after, key)).json()).toMatchObject({ cart: { count: 1 } });
});
