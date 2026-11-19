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

export async function verifyFavoriteCart(page: Page) {
  const tile = page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: "Добавить в корзину", exact: true }) })
    .first();
  await tile.getByRole("button", { name: "Добавить в избранное", exact: true }).click();
  await expect(tile.getByRole("button", { name: "Убрать из избранного", exact: true })).toBeVisible();
  await page.locator("header").getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByRole("button", { name: "Избранное", exact: true }).click();
  await expect(page.getByRole("button", { name: "Убрать из избранного", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/b12-favorites-390.png", animations: "disabled" });
  const tileOnList = page.locator("article").first();
  const choices = tileOnList.getByRole("button", { name: /фасовк/ });
  if (await choices.count()) {
    await choices.click();
    const variants = page.getByRole("dialog", { name: "Выберите фасовку" });
    const add = variants.getByRole("button", { name: "Добавить в корзину", exact: true }).first();
    await add.click();
    await expect(add).toHaveCount(0);
    await variants.getByRole("button", { name: "Закрыть", exact: true }).click();
  } else {
    await tileOnList.getByRole("button", { name: "Добавить в корзину", exact: true }).click();
    await expect(tileOnList.getByRole("button", { name: "Добавить одну штуку", exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: /^Корзина/ }).click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByRole("button", { name: /Увеличить|Добавить одну штуку/ }).first()).toBeVisible();
}
