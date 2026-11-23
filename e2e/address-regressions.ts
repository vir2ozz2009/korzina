import { type Browser, expect, type Page } from "@playwright/test";
import type { SaveReceivingSettings } from "../src/shared/contracts/seller-receiving";
import { freshPage } from "./fresh-page";

const shop = "test2";
const cart = "/api/receiving?shop=test2";
const outside = { lat: 48.8566, lon: 2.3522 };
const street = "12 rue de Rivoli, Paris";

export async function checkDeliveryDraft(page: Page) {
  const address = page.getByRole("button", { name: /28 Lê Lợi, Хошимин/ });
  await expect(address).toBeVisible();
  const pickup = page.getByRole("radio", { name: "Самовывоз" });
  if ((await pickup.count()) === 0 || !(await pickup.isEnabled())) return;
  await pickup.click();
  await expect(pickup).toBeChecked();
  await page.reload();
  await expect(pickup).toBeChecked();
  const delivery = page.getByRole("radio", { name: "Доставка" });
  await delivery.click();
  await expect(delivery).toBeChecked();
  await expect(address).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: "test-results/bl-14-restored-address-390.png", animations: "disabled" });
}

export async function checkTextDelivery(browser: Browser, baseURL: string) {
  const seller = await browser.newContext({ baseURL });
  const endpoint = `/api/seller/receiving/settings?store=${shop}`;
  try {
    expect((await seller.request.post("/__e2e/test2/seller")).ok()).toBe(true);
    const result = await seller.request.get(endpoint);
    expect(result.ok(), await result.text()).toBe(true);
    const { revision, delivery, pickup, requiredDetails, minimumMinor } = (await result.json()) as Omit<
      SaveReceivingSettings,
      "expectedRevision"
    > & { revision: number };
    const settings = { delivery, pickup, requiredDetails, minimumMinor };
    const write = async (data: SaveReceivingSettings) => {
      const response = await seller.request.put(endpoint, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
        data,
      });
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()) as { revision: number };
    };
    const changed = await write({
      ...settings,
      expectedRevision: revision,
      requiredDetails: [],
      delivery: { mode: "text", tariff: { kind: "free" }, payee: "shop" },
    });
    try {
      await freshPage(browser, baseURL, checkTextAddress);
    } finally {
      await write({ ...settings, expectedRevision: changed.revision });
    }
  } finally {
    await seller.close();
  }
}

async function checkTextAddress(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: outside.lat, longitude: outside.lon });
  await page.route("**/api/receiving/geocode?**", (route) => {
    const input = route.request().postDataJSON();
    return route.fulfill({
      json: {
        results: input.type === "reverse" || input.address === "rue de Rivoli" ? [{ address: street, ...outside }] : [],
      },
    });
  });
  await page.goto("/p/product-17?shop=test2&variant=sku-20");
  await page.getByRole("button", { name: "Добавить в корзину", exact: true }).click();
  await page.getByRole("button", { name: /^Корзина/ }).click();
  await page.getByRole("button", { name: "Укажите адрес доставки" }).click();
  const search = page.getByRole("dialog", { name: "Новый адрес" });
  await search.getByRole("searchbox").fill("rue de Rivoli");
  await expect(search.getByRole("button", { name: street })).toBeVisible();
  await expect(search.getByRole("button", { name: "Указать на карте" })).toBeVisible();
  await page.screenshot({ path: "test-results/bl-15-search-390.png", animations: "disabled" });
  await search.getByRole("button", { name: "Определить мою позицию" }).click();
  const map = page.getByRole("dialog", { name: "Адрес на карте" });
  await expect(map.getByText("Доставка доступна")).toBeVisible();
  await expect(map.getByText(street)).toBeVisible();
  await expect(map.locator(".leaflet-marker-icon")).toBeVisible();
  await page.screenshot({ path: "test-results/bl-15-map-390.png", animations: "disabled" });
  await map.getByRole("button", { name: "Подтвердить адрес" }).click();
  await expect(map).toBeHidden();
  expect(await (await page.request.get(cart)).json()).toMatchObject({
    receiving: { address: street, point: outside },
    availability: { available: true, inZone: null },
  });

  const address = "Дом с синими воротами";
  await page.getByRole("button", { name: new RegExp(street) }).click();
  await page.getByRole("button", { name: "Указать другой адрес" }).click();
  await search.getByRole("button", { name: "Ввести адрес вручную" }).click();
  const manual = page.getByRole("dialog", { name: "Ввести адрес вручную" });
  await manual.getByRole("textbox", { name: "Адрес доставки" }).fill(address);
  await page.screenshot({ path: "test-results/bl-15-manual-390.png", animations: "disabled" });
  await manual.getByRole("button", { name: "Сохранить адрес", exact: true }).click();
  await expect(manual).toBeHidden();
  const state = await (await page.request.get(cart)).json();
  expect(state.receiving).toMatchObject({ address });
  expect(state.receiving).not.toHaveProperty("point");
  expect(state.availability).toMatchObject({ available: true, inZone: null });
}
