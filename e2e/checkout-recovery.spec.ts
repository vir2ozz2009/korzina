import { expect, test } from "@playwright/test";
import type { OrderResult } from "../src/shared/contracts/checkout";

test("Блок 9 · 04: сохранённый заказ подтверждается при потере первого ответа", async ({ page }) => {
  const shop = await page.request.get("/api/shop?shop=test2");
  expect(shop.ok()).toBe(true);
  const { id } = await shop.json();
  const attempt = {
    key: crypto.randomUUID(),
    request: { quoteRevision: crypto.randomUUID(), payment: "cash" },
    startedAt: Date.now(),
  };
  await page.addInitScript(
    ({ storageKey, value }) => {
      localStorage.setItem(storageKey, JSON.stringify(value));
    },
    { storageKey: `korzina:${id}:checkout:v1:attempt`, value: attempt },
  );
  await page.route(/\/api\/receiving(?:\?|$)/, (route) => route.fulfill({ json: { revision: 1 } }));
  await page.route(/\/api\/auth\/contact(?:\?|$)/, (route) =>
    route.fulfill({ json: { phone: null, telegramLinked: false } }),
  );
  const result: OrderResult = {
    number: 70,
    revision: 1,
    currency: "VND",
    lines: [],
    itemsMinor: 0,
    deliveryMinor: 0,
    totalMinor: 0,
    receiving: { mode: "pickup" },
    fulfillment: { mode: "pickup", available: true, pickup: { address: "Учебный адрес", hours: "" } },
    time: null,
    phone: null,
    telegramLinked: false,
    payment: "cash",
    paymentStatus: "unpaid",
  };
  const orders = new Map<string, OrderResult>();
  const keys: string[] = [];
  await page.route(/\/api\/checkout(?:\?|$)/, async (route) => {
    const key = (await route.request().headerValue("idempotency-key")) ?? "";
    expect(route.request().postDataJSON()).toEqual(attempt.request);
    keys.push(key);
    const saved = orders.get(key);
    if (saved) return route.fulfill({ status: 201, json: saved });
    orders.set(key, result);
    await route.abort("connectionreset");
  });
  await page.goto("/checkout/payment?shop=test2");
  const retry = page.getByRole("button", { name: "Проверить ещё раз", exact: true });
  await retry.waitFor();
  await page.evaluate(() => {
    new MutationObserver(() => {
      if (document.body.textContent?.includes("Ответ об оформлении не получен"))
        document.body.dataset.checkoutFalseError = "true";
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await retry.click();
  await expect(page.getByRole("heading", { name: "Заказ №70" })).toBeVisible({ timeout: 7000 });
  await expect(page.getByText("Заказ сохранён", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toHaveAttribute("data-checkout-false-error", "true");
  expect(keys).toEqual([attempt.key, attempt.key]);
  expect(orders.size).toBe(1);
});
