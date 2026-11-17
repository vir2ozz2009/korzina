import { expect, it } from "vitest";
import { commitQueryResult, createQueryClient } from "./query-defaults";

it("команда обновляет сущность из ответа и сбрасывает только зависимые данные своего магазина", async () => {
  const client = createQueryClient();
  const cart = ["shop", "a", "cart"];
  const stock = ["shop", "a", "stock"];
  const otherStock = ["shop", "b", "stock"];
  client.setQueryData(stock, { quantity: 3 });
  client.setQueryData(otherStock, { quantity: 8 });
  await commitQueryResult(client, cart, { totalMinor: 18900 }, [stock]);
  expect(client.getQueryData(cart)).toEqual({ totalMinor: 18900 });
  expect(client.getQueryState(stock)?.isInvalidated).toBe(true);
  expect(client.getQueryState(otherStock)?.isInvalidated).toBe(false);
  client.clear();
});
