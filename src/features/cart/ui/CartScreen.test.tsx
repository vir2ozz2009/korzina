import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { cartCommandInput, cartContract } from "../../../shared/contracts/cart";
import { formatMinor } from "../../../shared/money";
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
  const router = await storefront("/cart", (url) => {
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
  await storefront("/cart", async (url, init) => {
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

it("PR 228 · 01: перед первым выбором окна обновляются итог и минимум с той же ревизией корзины", async () => {
  const fresh = reply();
  const terms = { currency: "VND", acceptingOrders: true, hasItems: true, unavailable: {} };
  const availability = { mode: "delivery", available: true, payee: "shop", tariff: "fixed", feeMinor: 20000 };
  let onReceiving = false;
  await storefront("/cart", (url) => {
    switch (url.pathname) {
      case "/api/cart":
        return Response.json(filledCart);
      case "/api/receiving":
        return Response.json({
          receiving: { mode: "delivery", address: "Учебный адрес" },
          delivery: { mode: "text", payee: "shop" },
          acceptingOrders: true,
          revision: filledCart.revision,
          savedAddresses: [],
          availability,
        });
      case "/api/receiving/availability":
        return Response.json({
          mode: "slots",
          days: [{ date: "2026-11-19", available: true, intervals: [{ id: "14:00-16:00", available: true }] }],
        });
      case "/api/checkout/summary":
        return onReceiving
          ? fresh.promise.then((response) => response.clone())
          : Response.json({ ...terms, availability, totalMinor: 65000, shortMinor: 0 });
      default:
        return purchaseSupport(url);
    }
  });
  const next = await screen.findByRole<HTMLButtonElement>("button", { name: /^Продолжить/ });
  await waitFor(() => expect(next.disabled).toBe(false));
  expect(next.textContent).toContain(formatMinor(65000, "VND"));
  onReceiving = true;
  fireEvent.click(next);
  await screen.findByRole("heading", { name: "Получение" });
  const noStaleAction = () => screen.queryByRole("button", { name: /^Выбрать время/ });
  expect(noStaleAction()).toBeNull();
  fresh.resolve(
    Response.json({
      ...terms,
      availability: { ...availability, feeMinor: 25000 },
      totalMinor: 70000,
      minimumMinor: 110000,
      shortMinor: 65000,
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    `Добавьте товаров ещё на ${formatMinor(65000, "VND")}`,
  );
  expect(noStaleAction()).toBeNull();
  fireEvent.click(button("В корзину"));
  await screen.findByRole("heading", { name: "Корзина" });
  const display = (minor: number) => formatMinor(minor, "VND").replace(/\s/gu, " ");
  await screen.findByText(display(70000));
  await screen.findByText(`Минимальная сумма товаров — ${display(110000)}`);
  expect(screen.queryByText(display(65000))).toBeNull();
});

it("PR 228 · 04: сохранённый ручной адрес переиспользуется после самовывоза, новый адрес проверяется", async () => {
  const saved = { mode: "delivery", address: "28 Lê Lợi", apartment: "12", acceptedWithoutPoint: true } as const;
  const pickup = { address: "Магазин", hours: "09:00–20:00" };
  const calls: string[] = [];
  await storefront("/cart", (url, init) => {
    switch (url.pathname) {
      case "/api/cart":
        return Response.json(filledCart);
      case "/api/receiving": {
        const verification = init?.method === "POST" ? JSON.parse(String(init.body)).receiving : undefined;
        if (verification) calls.push("save");
        return Response.json({
          acceptingOrders: true,
          revision: verification ? 2 : 1,
          receiving: verification ?? { mode: "pickup" },
          pickup,
          availability: verification ? { mode: "delivery", available: true, unverified: true, feeMinor: null } : null,
          delivery: { mode: "map", payee: "shop" },
          savedAddresses: [{ ...saved, id: "saved", title: "Дом" }],
        });
      }
      case "/api/receiving/verify-address":
        calls.push(JSON.parse(String(init?.body)).address);
        return Response.json({ error: { code: "OUT_OF_ZONE", message: "Сюда не доставляем" } }, { status: 409 });
      default:
        return purchaseSupport(url);
    }
  });
  const delivery = await screen.findByRole<HTMLInputElement>("radio", { name: "Доставка" });
  await waitFor(() => expect(delivery.closest("fieldset")?.disabled).toBe(false));
  fireEvent.click(delivery);
  fireEvent.click(await screen.findByRole("button", { name: /^Дом/ }));
  const save = await screen.findByRole("button", { name: "Сохранить адрес вручную" });
  const address = screen.getByRole("textbox", { name: "Адрес доставки" });
  fireEvent.change(address, { target: { value: "Другой адрес" } });
  fireEvent.click(save);
  await screen.findByText("Сюда не доставляем");
  fireEvent.click(button("Назад"));
  fireEvent.click(await screen.findByRole("button", { name: /^Дом/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Сохранить адрес вручную" }));
  await screen.findByRole("button", { name: /28 Lê Lợi.*Условия доставки уточняются/ });
  expect(calls).toEqual(["Другой адрес", "save"]);
});
