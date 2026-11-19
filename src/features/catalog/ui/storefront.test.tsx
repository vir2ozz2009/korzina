import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { cartContract } from "../../../shared/contracts/cart";
import { catalogListContract, catalogProductContract, catalogSearchContract } from "../../../shared/contracts/catalog";
import { catalog, filledCart, list, offers, product, storefront } from "../../../testing/storefront";

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const contact = { phone: null, telegramLinked: false, region: "VN" };
const base = (url: URL) => {
  switch (url.pathname) {
    case "/api/cart":
      return Response.json(filledCart);
    case "/api/catalog/document":
      return Response.json(catalog);
    case "/api/catalog/live":
      return Response.json(offers);
    case "/api/auth/contact":
      return Response.json(contact);
    default:
      return new Response(null, { status: 404 });
  }
};

it("П1: плавающая корзина видна в каталоге, скрывается при клавиатуре, в корзине, оформлении и заказе", async () => {
  const previousViewport = window.visualViewport;
  const viewport = new EventTarget() as VisualViewport;
  Object.assign(viewport, { height: innerHeight, scale: 1, offsetTop: 0 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  try {
    const router = storefront("/search", base);
    await screen.findByRole("button", { name: /^Корзина/ });
    const input = await screen.findByRole("textbox", { name: "Поиск товаров" });
    act(() => {
      input.focus();
      Object.assign(viewport, { height: innerHeight - 280 });
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(screen.queryByRole("button", { name: /^Корзина/ })).toBeNull();
    act(() => {
      input.blur();
      Object.assign(viewport, { height: innerHeight });
      viewport.dispatchEvent(new Event("resize"));
    });
    fireEvent.click(button(/^Корзина/));
    await screen.findByRole("heading", { name: "Корзина" });
    expect(screen.queryByRole("button", { name: /^Корзина/ })).toBeNull();
    await act(() => router.navigate({ to: "/checkout/receiving" }));
    expect(screen.queryByRole("button", { name: /^Корзина/ })).toBeNull();
    await act(() => router.navigate({ to: "/checkout/done", search: { order: 1 } }));
    expect(screen.queryByRole("button", { name: /^Корзина/ })).toBeNull();
  } finally {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: previousViewport });
  }
});

it("§9.3: счётчик фасовок открывает шторку, закончившуюся фасовку можно уменьшить", async () => {
  const commands: unknown[] = [];
  storefront("/", (url, init) => {
    if (url.pathname === "/api/auth/guest") return Response.json({ kind: "guest" });
    if (url.pathname === "/api/catalog/products/product-01")
      return Response.json(
        catalogProductContract.parse({
          ...product,
          variants: [{ ...product.variants[0], stock: 0, available: false }, product.variants[1]],
        }),
      );
    if (url.pathname === "/api/cart" && init?.method === "POST") {
      commands.push(JSON.parse(String(init.body)));
      return Response.json(cartContract.parse({ ...filledCart, revision: 2, lines: [], count: 0, totalMinor: 0 }));
    }
    return base(url);
  });
  fireEvent.click(await screen.findByRole("button", { name: /2 фасовки/ }));
  const sheet = within(await screen.findByRole("dialog", { name: "Выберите фасовку" }));
  const minus = await sheet.findByRole("button", { name: "Убрать одну штуку" });
  expect((sheet.getByRole("button", { name: "Добавить одну штуку" }) as HTMLButtonElement).disabled).toBe(true);
  expect((minus as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(minus);
  await waitFor(() => expect(commands).toEqual([{ variantId: "sku-01", quantity: 0, expectedRevision: 1 }]));
});

it("П3: сброс пустой выборки сохраняет сортировку", async () => {
  storefront("/catalog?sort=price-asc&max=1", (url) =>
    url.pathname === "/api/catalog/page"
      ? Response.json(url.searchParams.has("max") ? catalogListContract.parse({ ...list, count: 0, items: [] }) : list)
      : base(url),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Сбросить фильтры" }));
  await screen.findAllByRole("link", { name: /Томаты/ });
  expect(button("Сначала дешевле")).toBeTruthy();
});

it("§7.5: поиск сообщает, сколько товаров показано из общего числа", async () => {
  storefront("/search?q=томаты", (url) =>
    url.pathname === "/api/catalog/search"
      ? Response.json(catalogSearchContract.parse({ ...list, count: 19, preferred: {}, suggestion: null }))
      : base(url),
  );
  expect(await screen.findByText("Показано 1 из 19")).toBeTruthy();
});

it("§6: ошибка следующей страницы оставляет товары и позволяет повторить загрузку", async () => {
  let attempts = 0;
  storefront("/", (url) => {
    if (url.pathname === "/api/catalog/document") {
      if (!url.searchParams.has("after")) return Response.json({ ...catalog, next: "product-01" });
      if (++attempts === 1) return Promise.reject(new TypeError("Network error"));
      return Response.json({ ...catalog, items: [] });
    }
    return base(url);
  });
  await screen.findAllByRole("link", { name: /Томаты/ });
  fireEvent.click(button("Показать ещё"));
  const retry = await screen.findByRole("button", { name: "Повторить" });
  expect(screen.getAllByRole("link", { name: /Томаты/ })).toHaveLength(2);
  fireEvent.click(retry);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Показать ещё" })).toBeNull());
  expect(attempts).toBe(2);
});
