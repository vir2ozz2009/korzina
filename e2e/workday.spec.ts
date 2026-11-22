import { expect, test } from "@playwright/test";
import type { StorefrontReceiving } from "../src/shared/contracts/receiving-time";
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
    const next = storefront.waitForResponse((response) => new URL(response.url()).pathname === "/api/receiving/next");
    await storefront.goto("/?shop=test2");
    const availability: StorefrontReceiving = await (await next).json();
    expect(availability.methods.some(({ method }) => method === "pickup")).toBe(true);
    await expect(storefront.getByText(/Самовывоз:|Время самовывоза согласуем/).first()).toBeVisible();
    await storefront.screenshot({ path: "test-results/workday-storefront-390.png", animations: "disabled" });

    const order = await placePickup(buyer.request, true);
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
  } finally {
    await Promise.all([buyer.close(), seller.close()]);
  }
});
