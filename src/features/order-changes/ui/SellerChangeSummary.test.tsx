import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { CompositionSummary, OrderLine } from "../../../shared/contracts/order-changes";
import { SellerChangeSummary } from "./SellerChangeSummary";

afterEach(cleanup);

it("PR 228 · 03а, §13.2: ответ «Не нужно» сменяет ожидание на отказ в строке продавца", () => {
  const before: OrderLine = {
    variantId: "sku-01",
    productId: "product-01",
    name: "Сыр",
    unit: "200 г",
    quantity: 1,
    priceMinor: 50000,
    totalMinor: 50000,
  };
  const after = { ...before, variantId: "sku-02", name: "Молоко" };
  const pending: CompositionSummary = {
    id: "change",
    createdAt: 0,
    expiresAt: 1_800_000,
    originalMinor: 50000,
    totals: { originalMinor: 50000, currentMinor: 50000, currency: "VND" },
    lines: [{ id: "sku-01", kind: "replace", before, after, status: "pending", deltaMinor: 0 }],
  };
  const view = render(<SellerChangeSummary change={pending} timeZone="Asia/Ho_Chi_Minh" />);
  expect(screen.getByRole("status").textContent).toBe("Ждём ответа");

  view.rerender(
    <SellerChangeSummary
      timeZone="Asia/Ho_Chi_Minh"
      change={{
        ...pending,
        expiresAt: null,
        totals: { ...pending.totals, currentMinor: 0 },
        lines: [{ ...pending.lines[0], status: "declined", after: null, deltaMinor: -50000 }],
      }}
    />,
  );
  expect(screen.getByRole("status").textContent).toContain("Отказался");
  expect(screen.queryByText("Нет в наличии — убрали")).toBeNull();
  expect(screen.queryByText(/Ждём ответа/iu)).toBeNull();
});
