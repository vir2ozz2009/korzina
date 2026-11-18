import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { Cart, CartLine } from "../../shared/contracts/cart";
import { HttpError } from "../../shared/http-error";
import { type CartCommand, cartMutationOptions, optimisticCart } from "./commands";

const key = ["shop", "one", "cart"];
const empty: Cart = { revision: 0, currency: null, lines: [], count: 0, totalMinor: 0, adjustments: [] };
const line = (id: string, priceMinor = 100): CartLine => ({
  productId: id,
  variantId: id,
  name: id,
  unit: "шт",
  priceMinor,
  quantity: 0,
  stock: 10,
  available: true,
});
const command = (id: string, price = 100): CartCommand => ({
  line: line(id, price),
  quantity: 1,
  key: id,
  currency: "VND",
});
function held() {
  let resolve: (cart: Cart) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<Cart>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function pending(client: QueryClient) {
  return client
    .getMutationCache()
    .findAll({ mutationKey: key, status: "pending" })
    .map((m) => m.state.variables as CartCommand);
}

it("разные товары оптимистично видны вместе; очередь берёт последнюю подтверждённую ревизию", async () => {
  const client = new QueryClient();
  client.setQueryData(key, empty);
  const gate = held();
  const a = command("a"),
    b = command("b", 200);
  const firstCart = { ...optimisticCart(empty, [a]), revision: 1 };
  const finalCart = { ...optimisticCart(firstCart, [b]), revision: 2 };
  const send = vi.fn(async (input) => (input.key === "a" ? gate.promise : finalCart));
  const options = cartMutationOptions(client, key, send, vi.fn());
  const first = new MutationObserver(client, options).mutate(a);
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  const second = new MutationObserver(client, options).mutate(b);
  await vi.waitFor(() => expect(pending(client)).toHaveLength(2));
  expect(send).toHaveBeenCalledTimes(1);
  expect(optimisticCart(empty, pending(client))).toMatchObject({
    count: 2,
    totalMinor: 300,
    currency: "VND",
    revision: 0,
  });
  expect(client.getQueryData(key)).toEqual(empty);
  gate.resolve(firstCart);
  await Promise.all([first, second]);
  expect(send.mock.calls.map(([input]) => input.expectedRevision)).toEqual([0, 1]);
  expect(client.getQueryData(key)).toEqual(finalCart);
  client.clear();
});

it("конфликт первой команды не стирает вторую; актуальная серверная корзина становится базой", async () => {
  const client = new QueryClient();
  client.setQueryData(key, empty);
  const firstGate = held(),
    secondGate = held();
  const send = vi.fn(async (input) => (input.key === "a" ? firstGate.promise : secondGate.promise));
  const options = cartMutationOptions(client, key, send, vi.fn());
  const first = new MutationObserver(client, options).mutate(command("a")).catch((error) => error);
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  const second = new MutationObserver(client, options).mutate(command("b", 200));
  const current = { ...optimisticCart(empty, [command("c", 500)]), revision: 9 };
  firstGate.reject(new HttpError(409, "Конфликт", "VERSION_CONFLICT", { cart: current }));
  await first;
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(pending(client).map((input) => input.key)).toEqual(["b"]);
  const projected = optimisticCart(client.getQueryData<Cart>(key) ?? empty, pending(client));
  expect(projected.lines.map((item) => item.productId)).toEqual(["c", "b"]);
  expect(projected.totalMinor).toBe(700);
  expect(send.mock.calls[1][0].expectedRevision).toBe(9);
  secondGate.resolve({ ...projected, revision: 10 });
  await second;
  expect(client.getQueryData(key)).toMatchObject({ revision: 10, count: 2, totalMinor: 700 });
  client.clear();
});

it("сетевой повтор сохраняет ключ и ревизию команды и не затирает более новый кеш", async () => {
  const client = new QueryClient();
  client.setQueryData(key, { ...empty, revision: 3 });
  const send = vi.fn(async () => {
    if (send.mock.calls.length === 1) {
      client.setQueryData(key, { ...empty, revision: 7 });
      throw new HttpError(503, "Сеть");
    }
    return { ...empty, revision: 4 };
  });
  const options = { ...cartMutationOptions(client, key, send, vi.fn()), retryDelay: 0 };
  await new MutationObserver(client, options).mutate(command("a"));
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  expect(client.getQueryData(key)).toMatchObject({ revision: 7 });
  client.clear();
});
