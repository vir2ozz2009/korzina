import { setTimeout as delay } from "node:timers/promises";
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
  await page.locator("header").getByRole("button", { name: "Профиль", exact: true }).click();
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

export async function verifySavedAddress(page: Page) {
  await page.goBack();
  await expect(page).toHaveURL(/\/favorites/);
  await page.goBack();
  await expect(page.getByText("Вошли по номеру на этом устройстве")).toBeVisible();
  await expect(page.getByText("Заказ отменён", { exact: true })).toBeHidden({ timeout: 8_000 });
  await page.screenshot({ path: "test-results/b13-profile-390.png", animations: "disabled" });
  await page.getByRole("button", { name: "Мои адреса" }).click();
  await expect(page.getByRole("button", { name: /28 Lê Lợi/ })).toBeVisible();
  await page.getByRole("button", { name: "Добавить адрес", exact: true }).click();
  await page.getByRole("textbox", { name: "Название", exact: true }).fill("Работа");
  await page.getByRole("button", { name: /Адрес доставки/ }).click();
  await page.getByRole("searchbox", { name: "Улица, дом, город", exact: true }).fill("улица Ле Лой, 45");
  await page.getByRole("button", { name: "Сохранить адрес вручную", exact: true }).click();
  await page.getByRole("textbox", { name: "Квартира", exact: true }).fill("7");
  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/profile/addresses" && response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Сохранить", exact: true }).click(),
  ]);
  expect(saved.status()).toBe(200);
  await expect(page.getByRole("button", { name: /^Работа/ })).toBeVisible();
  await page.screenshot({ path: "test-results/b13-addresses-390.png", animations: "disabled" });
  await page.getByRole("button", { name: /^Корзина/ }).click();
  await expect(page).toHaveURL(/\/cart/);
  await page
    .getByRole("button", { name: /Адрес доставки|Условия доставки|Нужно проверить адрес/ })
    .first()
    .click();
  await page.getByRole("button", { name: /^Работа/ }).click();
  const confirm = page.getByRole("button", { name: "Сохранить адрес вручную", exact: true });
  const write = async () => {
    const response = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/receiving" && response.request().method() === "POST",
    );
    await confirm.click();
    return response;
  };
  let response = await write();
  if (response.status() === 429) {
    const seconds = Number(response.headers()["retry-after"]);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(30);
    await delay(seconds * 1_000);
    response = await write();
  }
  expect(response.ok()).toBe(true);
  await expect(page.getByRole("button", { name: /улица Ле Лой, 45/ })).toBeVisible();
}
