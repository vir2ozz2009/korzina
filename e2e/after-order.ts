import { expect, type Page } from "@playwright/test";

export async function verifyOrderCancellation(page: Page, number: number) {
  const activeOrder = page
    .getByRole("region", { name: "Активные заказы" })
    .getByRole("button", { name: new RegExp(`Заказ №${number}\\b`) });
  await expect(activeOrder).toBeVisible();
  await page.screenshot({ path: "test-results/b11-active-order-390.png", animations: "disabled" });
  await activeOrder.click();
  await expect(page.getByText("Магазин скоро возьмёт заказ в работу")).toBeVisible();
  await page.screenshot({ path: "test-results/b11-order-390.png", animations: "disabled", fullPage: true });
  await page.getByRole("button", { name: "Отменить заказ", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Отменить заказ", exact: true }).click();
  await expect(page.getByText("Заказ отменён", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "К покупкам", exact: true }).click();
  await expect(activeOrder).toHaveCount(0);
}
