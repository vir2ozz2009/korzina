import { setTimeout as delay } from "node:timers/promises";
import { expect, type Page } from "@playwright/test";
import { cartContract } from "../src/shared/contracts/cart";
import { fillAddressDetails } from "./purchase-address";

export async function verifyBuyerOrderReload(page: Page, number: number) {
  const heading = page.getByRole("heading", { name: `Заказ №${number}`, exact: true });
  await page.getByRole("button", { name: "Открыть заказ", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${number}\\?shop=test2$`));
  await page.reload();
  await expect(heading).toBeVisible();
  await expect(page.getByText("Магазин скоро возьмёт заказ в работу")).toBeVisible();
  await page.screenshot({ path: "test-results/b11-shop-reload-390.png", animations: "disabled" });
  await page.getByRole("button", { name: "Мои заказы", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\?shop=test2$/);
  await page.getByRole("button", { name: new RegExp(`^Заказ №${number}\\b`) }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${number}\\?shop=test2$`));
  await expect(heading).toBeVisible();
}

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
  // The checkout fixture has an unlimited 350 г variant, independent of the stock of other demo products.
  const product = page.locator('a[href="/p/product-17"]');
  const tile = page.locator("article").filter({ has: product });
  const removeFavorite = tile.getByRole("button", { name: "Убрать из избранного", exact: true });
  const addFavorite = tile.getByRole("button", { name: "Добавить в избранное", exact: true });
  await expect(addFavorite.or(removeFavorite)).toBeEnabled();
  const wasFavorite = await removeFavorite.isVisible();
  if (wasFavorite) await removeFavorite.click();
  await addFavorite.click();
  await expect(removeFavorite).toBeVisible();
  await page.locator("header").getByRole("button", { name: "Профиль", exact: true }).click();
  await page.getByRole("button", { name: "Избранное", exact: true }).click();
  await expect(page).toHaveURL(/\/favorites(?:\?|$)/);
  await expect(removeFavorite).toBeVisible();
  await page.screenshot({ path: "test-results/b12-favorites-390.png", animations: "disabled" });
  await tile.getByRole("button", { name: "Выбрать фасовку", exact: true }).click();
  const variants = page.getByRole("dialog", { name: "Выберите фасовку" });
  const pack = variants.locator("div.rounded-lg").filter({ has: page.getByText("350 г", { exact: true }) });
  const added = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/cart" && response.request().method() === "POST",
  );
  await pack.getByRole("button", { name: "Добавить в корзину", exact: true }).click();
  const response = await added;
  expect(response.ok()).toBe(true);
  expect(cartContract.parse(await response.json()).lines).toContainEqual(
    expect.objectContaining({ productId: "product-17", variantId: "sku-20", quantity: 1 }),
  );
  await expect(pack.getByLabel("В корзине", { exact: true })).toHaveText("1");
  await variants.getByRole("button", { name: "Закрыть", exact: true }).click();
  if (!wasFavorite) {
    await removeFavorite.click();
    await expect(tile).toHaveCount(0);
  }
  await page.getByRole("button", { name: /^Корзина/ }).click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByRole("button", { name: /Увеличить|Добавить одну штуку/ }).first()).toBeVisible();
}

export async function verifySavedAddress(page: Page, onMap: boolean) {
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
  const entry = page.getByRole("dialog", { name: onMap ? "Новый адрес" : "Ввести адрес вручную" });
  const address = onMap
    ? entry.getByRole("searchbox", { name: "Улица, дом, город", exact: true })
    : entry.getByRole("textbox", { name: "Адрес доставки", exact: true });
  const saveAddress = onMap ? "Сохранить адрес вручную" : "Сохранить адрес";
  await address.fill("улица Ле Лой, 45");
  if (!onMap) await fillAddressDetails(entry, "7");
  await entry.getByRole("button", { name: saveAddress, exact: true }).click();
  await expect(entry).toBeHidden();
  await fillAddressDetails(page, "7", false);
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
  const confirm = page.getByRole("button", { name: saveAddress, exact: true });
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
