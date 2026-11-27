import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { cartContract } from "../../../shared/contracts/cart";
import { formatMinor } from "../../../shared/money";
import { cartLine, filledCart, storefront } from "../../../testing/storefront";

it("D2 · периодическая проверка с той же ревизией обновляет summary; ошибка не возвращает старую сумму", async () => {
  let refresh: (() => void) | undefined;
  const interval = window.setInterval.bind(window);
  const timer = vi.spyOn(window, "setInterval").mockImplementation((handler, timeout, ...args) => {
    if (timeout === 30_000 && typeof handler === "function") refresh = handler as () => void;
    return interval(handler, timeout, ...args) as unknown as ReturnType<typeof window.setInterval>;
  });
  let disabled = false;
  let fail = false;
  let summaries = 0;
  let release: (() => void) | undefined;
  let delayed: Promise<void> | undefined;
  const money = (value: number) => formatMinor(value, "VND").replace(/\s/gu, " ");
  const next = () => screen.queryByRole<HTMLButtonElement>("button", { name: /^Продолжить/ });
  try {
    await storefront("/cart", async (url) => {
      switch (url.pathname) {
        case "/api/cart":
          return Response.json(
            cartContract.parse({
              ...filledCart,
              itemsMinor: 313000,
              totalMinor: disabled ? 313000 : 291000,
              lines: [{ ...cartLine, priceMinor: 313000, totalMinor: disabled ? 313000 : 291000 }],
              promo: { code: "COMBO", offerType: "bundle", reason: disabled ? "disabled" : undefined },
            }),
          );
        case "/api/cart/promotions":
          return Response.json([]);
        case "/api/auth/contact":
          return Response.json({ phone: "+84912345678", telegramLinked: false, region: "VN" });
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
          summaries++;
          await delayed;
          if (fail) throw new TypeError("Network error");
          return Response.json({
            currency: "VND",
            acceptingOrders: true,
            shortMinor: 0,
            deliveryMinor: 0,
            totalMinor: disabled ? 313000 : 291000,
          });
        default:
          return new Response(null, { status: 404 });
      }
    });
    await waitFor(() => expect(next()?.disabled).toBe(false));
    expect(next()?.textContent?.replace(/\s/gu, " ")).toContain(money(291000));
    const before = summaries;
    delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    disabled = true;
    await act(async () => {
      vi.setSystemTime(Date.now() + 30_000);
      refresh?.();
    });
    await screen.findByText("Код больше не действует");
    await waitFor(() => expect(summaries).toBeGreaterThan(before));
    expect(next()).toBeNull();
    expect(screen.queryByText(money(291000))).toBeNull();
    await act(async () => release?.());
    await waitFor(() => expect(next()?.disabled).toBe(false));
    expect(next()?.textContent?.replace(/\s/gu, " ")).toContain(money(313000));
    expect(screen.getByText(money(313000), { selector: "strong.text-title-3" })).toBeTruthy();

    fail = true;
    await act(async () => {
      vi.setSystemTime(Date.now() + 30_000);
      refresh?.();
    });
    await screen.findByText(/Не удалось пересчитать заказ/);
    expect(next()).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /^Повторить$/ }));
    await waitFor(() => expect(next()?.disabled).toBe(false));
    expect(next()?.textContent?.replace(/\s/gu, " ")).toContain(money(313000));
  } finally {
    timer.mockRestore();
  }
});
