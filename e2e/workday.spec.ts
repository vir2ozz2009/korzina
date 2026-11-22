import { expect, test } from "@playwright/test";
import type { StorefrontReceiving } from "../src/shared/contracts/receiving-time";
import type { SellerOrder } from "../src/shared/contracts/seller-order";
import { placePickup } from "./seller-orders";

test("Блок 9 · ближайшее получение, рабочий день и заказы в сборке", async ({ browser, baseURL }) => {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Нужна локальная учебная сессия кабинета");
  const [buyer, seller] = await Promise.all([
    browser.newContext({ baseURL, extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.91" } }),
    browser.newContext({ baseURL, extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.92" } }),
  ]);
  try {
    expect((await seller.request.post("/__e2e/test2/seller")).status()).toBe(204);
    const storefront = await buyer.newPage();
    await storefront.goto("/?shop=test2");
    const availability: StorefrontReceiving = await (await buyer.request.get("/api/receiving/next?shop=test2")).json();
    expect(availability.methods.some(({ method }) => method === "pickup")).toBe(true);
    await expect(storefront.getByText(/Самовывоз:|Время самовывоза согласуем/).first()).toBeVisible();
    await storefront.screenshot({ path: "test-results/workday-storefront-390.png", animations: "disabled" });

    const order = await placePickup(buyer.request, true);
    const pickup = availability.methods.find(({ method }) => method === "pickup");
    expect(order.time?.date).toBe(pickup?.date);
    if (pickup?.mode === "slots") expect(order.time?.slotId).toBe(`${pickup.start}-${pickup.end}`);
    const cabinet = await seller.newPage();
    await cabinet.goto("/seller?store=test2");
    const receipt = cabinet.getByRole("button", { name: /^Проверить чек/ });
    await expect(receipt).toBeVisible();
    await expect(cabinet.getByRole("heading", { name: "По этапам" })).toBeVisible();
    await cabinet.screenshot({ path: "test-results/workday-home-390.png", animations: "disabled" });
    await receipt.click();
    const find = () => cabinet.getByRole("button", { name: `Открыть заказ №${order.number}`, exact: true });
    await expect(find()).toBeVisible();
    await cabinet.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(cabinet.getByRole("heading", { name: "Главная" })).toBeVisible();

    await cabinet.getByRole("button", { name: "Календарь", exact: true }).click();
    await expect(cabinet.getByRole("heading", { name: "Календарь", exact: true })).toBeVisible();
    const date = order.time?.date ?? availability.today;
    const formattedDate = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(date),
    );
    if (date.slice(0, 7) !== availability.today.slice(0, 7))
      await cabinet.getByRole("button", { name: "Следующий месяц", exact: true }).click();
    await cabinet.screenshot({ path: "test-results/workday-calendar-390.png", animations: "disabled" });
    await cabinet.getByRole("button", { name: new RegExp(`^${formattedDate},`) }).click();
    await expect(find()).toBeVisible();

    await cabinet.goto(`/seller/workday/packing?store=test2&day=${date}&view=day`);
    const product = cabinet.getByRole("button", { name: new RegExp(order.lines[0].name, "u") }).first();
    await expect(product).toBeVisible();
    await cabinet.screenshot({ path: "test-results/workday-packing-390.png", animations: "disabled" });
    await product.click();
    const sheet = cabinet.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: new RegExp(`^№${order.number} ·`) })).toBeVisible();
    await cabinet.screenshot({ path: "test-results/workday-packing-orders-390.png", animations: "disabled" });
    await sheet.getByRole("button", { name: new RegExp(`^№${order.number} ·`) }).click();
    await expect(cabinet.getByRole("heading", { name: `Заказ №${order.number}` })).toBeVisible();
    await cabinet.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(cabinet).toHaveURL(/view=day/);
    await expect(product).toBeVisible();

    const sellerOrder = `/api/seller/orders/${order.number}`;
    let current: SellerOrder = await (await seller.request.get(`${sellerOrder}?store=test2`)).json();
    for (const step of [
      { action: "accept" },
      { action: "setAllPacked", packed: true },
      { action: "markReady" },
      { action: "confirmTransfer", proof: current.receipts[0].id, amountMinor: order.totalMinor },
      { action: "markPickedUp" },
    ]) {
      const response = await seller.request.post(`${sellerOrder}/transition?store=test2`, {
        data: { ...step, expectedRevision: current.revision },
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      expect(response.ok(), await response.text()).toBe(true);
      current = await response.json();
    }
    await storefront.goto(`/orders/${order.number}?shop=test2`);
    await expect(storefront.getByRole("heading", { name: "Выдан", exact: true })).toBeVisible();
  } finally {
    await Promise.all([buyer.close(), seller.close()]);
  }
});
