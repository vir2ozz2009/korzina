import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReplacementPicker } from "./ReplacementPicker";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("PR 228 · 05: повторное открытие фасовки сохраняет уменьшенное количество", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json([
      { variantId: "milk", name: "Молоко", unit: "500 мл", stock: 1 },
      { variantId: "kefir", name: "Кефир", unit: "500 мл", stock: 2 },
    ]),
  );
  const choose = vi.fn();
  const line = {
    variantId: "sku-01",
    productId: "product-01",
    name: "Томаты",
    unit: "500 г",
    quantity: 2,
    priceMinor: 45000,
    totalMinor: 90000,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReplacementPicker store="test2" number={1} line={line} choose={choose} back={vi.fn()} />
    </QueryClientProvider>,
  );
  const button = (name: string | RegExp) => screen.getByRole<HTMLButtonElement>("button", { name });
  fireEvent.click(await screen.findByRole("button", { name: /^Молоко/ }));
  expect(button("Выбрать").disabled).toBe(true);
  fireEvent.click(button("Уменьшить количество"));
  fireEvent.click(button("Назад"));
  fireEvent.click(button(/^Кефир/));
  expect(screen.getByLabelText("Количество").textContent).toBe("2");
  fireEvent.click(button("Назад"));
  fireEvent.click(button(/^Молоко/));
  expect(screen.getByLabelText("Количество").textContent).toBe("1");
  fireEvent.click(button("Выбрать"));
  expect(choose).toHaveBeenCalledExactlyOnceWith("milk", 1);
});
