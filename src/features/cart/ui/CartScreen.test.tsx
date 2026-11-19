import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { cartCommandInput, cartContract } from "../../../shared/contracts/cart";
import { cartLine, emptyCart, filledCart, storefront } from "../../../testing/storefront";

const button = (name: RegExp | string) => screen.getByRole<HTMLButtonElement>("button", { name });
function reply() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function purchaseSupport(url: URL) {
  switch (url.pathname) {
    case "/api/auth/contact":
      return Response.json({ phone: "+84912345678", telegramLinked: false, region: "VN" });
    case "/api/auth/guest":
      return Response.json({});
    case "/api/receiving":
      return Response.json({
        receiving: { mode: "pickup" },
        pickup: { address: "Магазин" },
        acceptingOrders: true,
        revision: 1,
        savedAddresses: [],
        availability: null,
      });
    case "/api/checkout/summary":
      return Response.json({ currency: "VND", acceptingOrders: true, shortMinor: 0, totalMinor: 45000 });
    default:
      return new Response(null, { status: 404 });
  }
}

it("§3.1: открытие корзины ждёт ответа, повтор после потери сети сохраняет позиции", async () => {
  const first = reply();
  const retry = reply();
  let reads = 0;
  const router = storefront("/cart", (url) => {
    if (url.pathname !== "/api/cart") return purchaseSupport(url);
    if (++reads === 1) return first.promise;
    if (reads === 2) return Promise.reject(new TypeError("Network error"));
    return retry.promise;
  });
  await screen.findByRole("heading", { name: "Корзина" });
  expect(screen.queryByText("Корзина пуста")).toBeNull();
  expect(screen.getByRole("main").querySelector('[aria-busy="true"]')).toBeTruthy();
  first.resolve(Response.json(filledCart));
  await screen.findByRole("button", { name: "Удалить Томаты" });
  void router.options.context.qc.refetchQueries({ queryKey: ["shop", "korzina-demo-test2", "cart"] });
  const retryButton = await screen.findByRole("button", { name: "Повторить проверку" });
  expect(button("Удалить Томаты")).toBeTruthy();
  fireEvent.click(retryButton);
  retry.resolve(Response.json(filledCart));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(button("Удалить Томаты")).toBeTruthy();
});

it("§3.1: удаление можно отменить, а на время пересчёта количество и продолжение блокируются", async () => {
  const commands: unknown[] = [];
  const increase = reply();
  storefront("/cart", async (url, init) => {
    if (url.pathname !== "/api/cart") return purchaseSupport(url);
    if (init?.method !== "POST") return Response.json(filledCart);
    const input = cartCommandInput.parse(JSON.parse(String(init.body)));
    if (!("quantity" in input)) throw new Error("Unexpected confirmation");
    commands.push(input);
    if (input.quantity === 2) return increase.promise;
    return Response.json(
      cartContract.parse({
        ...emptyCart,
        revision: input.expectedRevision + 1,
        count: input.quantity,
        totalMinor: input.quantity * cartLine.priceMinor,
        lines: input.quantity ? [{ ...cartLine, quantity: input.quantity }] : [],
      }),
    );
  });
  const plus = await screen.findByRole<HTMLButtonElement>("button", { name: "Увеличить количество" });
  const next = await screen.findByRole<HTMLButtonElement>("button", { name: /^Продолжить/ });
  await waitFor(() => expect(next.disabled).toBe(false));
  fireEvent.click(plus);
  await waitFor(() => expect(commands).toHaveLength(1));
  expect(plus.disabled).toBe(true);
  expect(button("Уменьшить количество").disabled).toBe(true);
  expect(next.disabled).toBe(true);
  increase.resolve(
    Response.json(
      cartContract.parse({
        ...filledCart,
        revision: 2,
        count: 2,
        totalMinor: 90000,
        lines: [{ ...cartLine, quantity: 2 }],
      }),
    ),
  );
  const remove = button("Удалить Томаты");
  await waitFor(() => expect(remove.disabled).toBe(false));
  fireEvent.click(remove);
  const undo = await screen.findByRole("button", { name: "Вернуть" });
  await waitFor(() => expect(commands).toHaveLength(2));
  fireEvent.click(undo);
  await screen.findByRole("button", { name: "Удалить Томаты" });
  expect(commands).toEqual([
    { variantId: "sku-01", quantity: 2, expectedRevision: 1 },
    { variantId: "sku-01", quantity: 0, expectedRevision: 2 },
    { variantId: "sku-01", quantity: 2, expectedRevision: 3 },
  ]);
});
