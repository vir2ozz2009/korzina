import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PromoOffer } from "../../../../shared/contracts/promo";
import type { Report } from "./api";
import { PromoResults } from "./PromoResults";

vi.mock("./api", () => ({ promoRequest: vi.fn() }));

import { promoRequest } from "./api";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.resetAllMocks();
});

it("§11 K4c: 403 на повторном чтении удаляет видимый отчёт, заказ и кэш", async () => {
  const offer: PromoOffer = {
    id: "offer",
    revision: 1,
    terms: {
      name: "Акция",
      kind: "automatic",
      discount: { type: "fixed", value: 50 },
      scope: { type: "all" },
      confirmed: false,
    },
    status: "active",
    used: 1,
    orders: 1,
    savingsMinor: 50,
  };
  const report: Report = {
    orderCount: 1,
    customers: 1,
    guestOrders: 0,
    deliveryMinor: 0,
    thresholdCount: 0,
    thresholdAverage: null,
    purchaseStats: [],
    itemsMinor: 100,
    savingsMinor: 50,
    nextOffset: null,
    orders: [{ number: 91, completedAt: Date.now(), name: "Учебный покупатель", itemsMinor: 100, savingMinor: 50 }],
  };
  const request = vi.mocked(promoRequest).mockResolvedValueOnce(report).mockRejectedValueOnce({ status: 403 });
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PromoResults offer={offer} store="test2" account="seller" currency="VND" zone="UTC" openOrder={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Заказы с акцией/ }));
  expect(screen.getByRole("button", { name: /Заказ №91/ })).toBeTruthy();
  const reportKey = ["seller-promotions", "test2", "seller", "offer", "report"];
  await act(() => client.invalidateQueries({ queryKey: reportKey }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Доступ к результатам ограничен");
  expect(screen.queryByRole("button", { name: /Заказ №91/ })).toBeNull();
  expect(screen.queryByText("Сумма товаров в этих заказах")).toBeNull();
  expect(sessionStorage.getItem("korzina:promo-report:test2:seller:offer")).toBeNull();
  expect(request).toHaveBeenCalledTimes(2);
  client.clear();
});
