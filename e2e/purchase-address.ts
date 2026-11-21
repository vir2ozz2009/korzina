import { expect, type Locator, type Page } from "@playwright/test";
import type { FulfillmentSettings } from "../src/shared/contracts/receiving";
import { confirmAddressWithoutGeocoders } from "./address-verification";

export async function fillAddressDetails(scope: Page | Locator, apartment: string, required = true) {
  for (const [label, value] of Object.entries({ Квартира: apartment, Подъезд: "2", Этаж: "3", Домофон: "12" })) {
    const field = scope.getByRole("textbox", { name: required ? `${label} *` : label, exact: true });
    if (await field.isVisible()) await field.fill(value);
  }
}

export async function chooseDeliveryAddress(page: Page) {
  const mode = await page.evaluate(async () => {
    const response = await fetch("/api/receiving?shop=test2");
    if (!response.ok) throw new Error(`Получение: HTTP ${response.status}`);
    const { delivery } = (await response.json()) as Pick<FulfillmentSettings, "delivery">;
    return delivery?.mode;
  });
  expect(["map", "text"]).toContain(mode);
  if (mode === "map") {
    await chooseMappedAddress(page);
    return true;
  }

  await page.getByRole("button", { name: "Укажите адрес доставки", exact: true }).click();
  const manual = page.getByRole("dialog", { name: "Ввести адрес вручную" });
  const address = "28 Lê Lợi, Хошимин";
  await manual.getByRole("textbox", { name: "Адрес доставки" }).fill(address);
  await fillAddressDetails(manual, "12А");
  const saved = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/receiving" && response.request().method() === "POST",
  );
  await manual.getByRole("button", { name: "Сохранить адрес", exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    receiving: { mode: "delivery", address },
    availability: { available: true, mode: "delivery", inZone: true },
  });
  await expect(manual).toBeHidden();
  await expect(page.getByRole("button", { name: /28 Lê Lợi, Хошимин/ })).toBeVisible();
  await page.screenshot({ path: "test-results/cart-address-390.png", animations: "disabled" });
  return false;
}

async function chooseMappedAddress(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 48.8566, longitude: 2.3522 });
  let namedPoint = false;
  await page.route("**/api/receiving/geocode?**", async (route) => {
    const input = route.request().postDataJSON();
    if (input.type === "reverse" && input.point.lat > 15) {
      await route.fulfill({ json: { results: [{ address: "136 Hồ Xuân Hương, Дананг", ...input.point }] } });
    } else if (input.type === "reverse" && namedPoint) {
      await route.fulfill({ json: { results: [{ address: "45 Lê Lợi, Хошимин", ...input.point }] } });
    } else if (input.type === "reverse") {
      await route.fulfill({ status: 404, json: { error: { code: "ADDRESS_NOT_FOUND", message: "Адрес не найден" } } });
    } else if (input.type === "search" && input.address === "45 Lê Lợi") {
      await route.fulfill({ json: { results: [{ address: "45 Lê Lợi, Хошимин", lat: 10.7769, lon: 106.7009 }] } });
    } else {
      await route.fulfill({
        status: 503,
        json: { error: { code: "GEOCODER_UNAVAILABLE", message: "Сбой подсказок" } },
      });
    }
  });
  await page.getByRole("button", { name: "Укажите адрес доставки", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Новый адрес" });
  const street = search.getByRole("searchbox", { name: "Улица, дом, город" });
  await street.fill("136 Hồ Xuân Hương, Дананг");
  const nearBuyer = page.waitForRequest("https://tile.openstreetmap.org/16/33196/22546.png");
  await search.getByRole("button", { name: "Указать на карте" }).click();
  const map = page.getByRole("dialog", { name: "Адрес на карте" });
  await nearBuyer;
  await expect(map.locator(".leaflet-marker-icon")).toHaveCount(0);
  await page.context().setGeolocation({ latitude: 16.036, longitude: 108.25 });
  await map.getByRole("button", { name: "Определить мою позицию" }).click();
  await expect(map.getByText("За пределами зоны доставки")).toBeVisible();
  await expect(map.getByText("136 Hồ Xuân Hương, Дананг")).toBeVisible();
  await expect(map.getByRole("button", { name: "Подтвердить адрес" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/checkout-address-outside-390.png", animations: "disabled" });
  await map.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(street).toHaveValue("136 Hồ Xuân Hương, Дананг");
  await expect(search.getByRole("button", { name: "Сохранить адрес вручную" })).toHaveCount(0);

  await street.fill("28 Lê Lợi, Хошимин");
  await page.context().setGeolocation({ latitude: 10.7769, longitude: 106.7009 });
  await search.getByRole("button", { name: "Указать на карте" }).click();
  await map.getByRole("button", { name: "Определить мою позицию" }).click();
  await expect(map.getByText("Доставка доступна", { exact: true })).toBeVisible();
  await expect(map.getByText(/25\s000/)).toBeVisible();
  await expect(map.getByRole("textbox", { name: "Адрес для курьера" })).toHaveValue("28 Lê Lợi, Хошимин");
  await page.screenshot({ path: "test-results/checkout-address-pin-390.png", animations: "disabled" });

  await map.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(street).toHaveValue("28 Lê Lợi, Хошимин");
  await search.getByRole("button", { name: "Указать на карте" }).click();
  await map.getByRole("button", { name: "Подтвердить адрес" }).click();
  await expect(map).toBeHidden();
  const orderTotals = page.getByRole("heading", { name: "Ваш заказ" }).locator("..");
  await expect(orderTotals.getByText(/25\s000/)).toBeVisible();

  const chooser = page.getByRole("dialog", { name: "Адрес доставки" });
  await page.getByRole("button", { name: /28 Lê Lợi, Хошимин.*Адрес доставки/ }).click();
  await expect(chooser.getByRole("searchbox")).toHaveCount(0);
  await page.screenshot({ path: "test-results/checkout-address-chooser-390.png", animations: "disabled" });
  await chooser.getByRole("button", { name: "Указать другой адрес" }).click();
  await street.fill("28 Lê Lợi, Хошимин");
  await page.context().clearPermissions();
  await search.getByRole("button", { name: "Указать на карте" }).click();
  const locate = map.getByRole("button", { name: "Определить мою позицию" });
  await locate.click();
  await expect(map.getByText(/Разрешите геопозицию для этого сайта/)).toBeVisible();
  await page.screenshot({ path: "test-results/checkout-address-map-fallback-390.png", animations: "disabled" });
  await map.getByRole("button", { name: "Ввести адрес вручную", exact: true }).click();
  await expect(street).toHaveValue("28 Lê Lợi, Хошимин");
  await street.fill("45 Lê Lợi");
  const suggestions = search.getByRole("list", { name: "Подсказки адреса" });
  await expect(suggestions.getByRole("button", { name: "45 Lê Lợi, Хошимин", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/checkout-address-suggestions-390.png", animations: "disabled" });
  await street.fill("28 Lê Lợi, Хошимин");
  await expect(search.getByText("Подсказки пока недоступны. Можно сохранить набранный текст.")).toBeVisible();
  await page.screenshot({ path: "test-results/checkout-address-fallback-390.png", animations: "disabled" });
  await confirmAddressWithoutGeocoders(page, search, "28 Lê Lợi, Хошимин");
  await expect(search).toBeHidden();
  const savedAddress = page.getByRole("button", { name: /28 Lê Lợi, Хошимин.*Условия доставки уточняются/ });
  await expect(savedAddress).toBeVisible();
  await expect(orderTotals.getByText("Согласуем после заказа")).toBeVisible();
  await page.screenshot({ path: "test-results/cart-address-390.png", animations: "disabled" });

  namedPoint = true;
  await page.context().setGeolocation({ latitude: 10.777, longitude: 106.701 });
  await page.context().grantPermissions(["geolocation"]);
  await savedAddress.click();
  await chooser.getByRole("button", { name: /28 Lê Lợi, Хошимин.*Текущий адрес/ }).click();
  const manual = page.getByRole("dialog", { name: "Ввести адрес вручную" });
  await expect(manual.getByRole("textbox", { name: "Адрес доставки" })).toHaveValue("28 Lê Lợi, Хошимин");
  await page.screenshot({ path: "test-results/checkout-address-manual-to-map-390.png", animations: "disabled" });
  await manual.getByRole("button", { name: "Указать на карте" }).click();
  await locate.click();
  await expect(map.getByText("45 Lê Lợi, Хошимин", { exact: true })).toBeVisible();
  await expect(map.getByRole("textbox", { name: "Адрес для курьера" })).toHaveValue("28 Lê Lợi, Хошимин");
  await page.screenshot({ path: "test-results/checkout-address-manual-pin-390.png", animations: "disabled" });
  await map.getByRole("button", { name: "Подтвердить адрес" }).click();
  await expect(map).toBeHidden();
  await expect(page.getByRole("button", { name: /28 Lê Lợi, Хошимин.*Адрес доставки/ })).toBeVisible();
  await expect(orderTotals.getByText(/25\s000/)).toBeVisible();
}
