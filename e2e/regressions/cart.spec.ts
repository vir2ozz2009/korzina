import { expect, type Page } from "@playwright/test";
import { checkOptimalBundles } from "../promo-optimal";
import {
  address,
  anywhere,
  command,
  configure,
  hours,
  json,
  point,
  prepareCart,
  resume,
  saveDelivery,
  storefront,
  test,
  zone,
} from "./fixture";

const tag = { tag: "@regression" };
const cart = `/cart?${storefront}`;
const receiving = `/api/receiving?${storefront}`;
const outside = { lat: 48.8566, lon: 2.3522 };

test.beforeEach(async ({ seller }) => {
  await configure(seller.request, { delivery: anywhere, requiredDetails: [], minimumMinor: 120000 });
  await resume(seller.request);
});

async function newAddress(page: Page) {
  await page.getByRole("button", { name: "Укажите адрес доставки", exact: true }).click();
  return page.getByRole("dialog", { name: "Новый адрес" });
}

test("BL-14 адрес остаётся после Самовывоз → Доставка", tag, async ({ page }) => {
  await test.step("FIX-PROMO-OPT: минимум пересекающихся комбо и пересчёт", async () => {
    const isolated = await page.context().newPage();
    try {
      await checkOptimalBundles(isolated);
    } finally {
      await isolated.close();
    }
  });
  await prepareCart(page);
  await saveDelivery(page);
  await page.goto(cart);
  const saved = page.getByRole("button", { name: new RegExp(address) });
  await expect(saved).toBeVisible();
  const pickup = page.getByRole("radio", { name: "Самовывоз" });
  await pickup.click();
  await expect(pickup).toBeChecked();
  await page.reload();
  await expect(pickup).toBeChecked();
  const delivery = page.getByRole("radio", { name: "Доставка" });
  await delivery.click();
  await expect(delivery).toBeChecked();
  await expect(saved).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await json(await page.request.get(receiving))).toMatchObject({
    receiving: { mode: "delivery", address, point, apartment: "12" },
  });
});

test("BL-1 сохранённый адрес подставляется без повторного сохранения", tag, async ({ page }) => {
  await prepareCart(page);
  const path = `/api/profile/addresses?${storefront}`;
  const { revision } = await json<{ revision: number }>(await page.request.get(path));
  await json(
    await page.request.post(path, {
      data: {
        action: "save",
        revision,
        title: "QA1 · Работа",
        receiving: { mode: "delivery", address, apartment: "7" },
      },
      headers: command(),
    }),
  );
  await page.goto(cart);
  await page.getByRole("button", { name: "Укажите адрес доставки", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Адрес доставки" });
  await chooser.getByRole("button", { name: /^QA1 · Работа/ }).click();
  await expect(chooser).toBeHidden();
  await expect(page.getByRole("button", { name: new RegExp(address) })).toBeVisible();
  expect(await json(await page.request.get(receiving))).toMatchObject({ receiving: { address, apartment: "7" } });
});

test(
  "BL-15 Куда угодно показывает подсказки, карту, геопозицию и принимает точку вне города",
  tag,
  async ({ page }) => {
    await prepareCart(page);
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({ latitude: outside.lat, longitude: outside.lon });
    const street = "12 rue de Rivoli, Paris";
    await page.route("**/api/receiving/geocode?**", (route) =>
      route.fulfill({ json: { results: [{ address: street, ...outside }] } }),
    );
    await page.goto(cart);
    const search = await newAddress(page);
    await search.getByRole("searchbox").fill("rue de Rivoli");
    await expect(search.getByRole("button", { name: street })).toBeVisible();
    await expect(search.getByRole("button", { name: "Указать на карте" })).toBeVisible();
    await search.getByRole("button", { name: "Определить мою позицию" }).click();
    const form = page.getByRole("dialog", { name: "Редактировать адрес" });
    await expect(form.getByRole("textbox", { name: "Адрес доставки" })).toHaveValue(street);
    await expect(form.locator(".leaflet-marker-icon")).toBeVisible();
    await form.getByRole("button", { name: "Сохранить адрес", exact: true }).click();
    await expect(page.getByRole("button", { name: new RegExp(street) })).toBeVisible();
    expect(await json(await page.request.get(receiving))).toMatchObject({
      receiving: { address: street, point: outside },
      availability: { available: true, inZone: null },
    });
  },
);

test("BL-15 Куда угодно принимает произвольный адрес без подсказок", tag, async ({ page }) => {
  await prepareCart(page);
  await page.goto(cart);
  const search = await newAddress(page);
  await search.getByRole("button", { name: "Ввести адрес вручную" }).click();
  const manual = page.getByRole("dialog", { name: "Ввести адрес вручную" });
  const street = "Дом с синими воротами";
  await manual.getByRole("textbox", { name: "Адрес доставки" }).fill(street);
  await manual.getByRole("button", { name: "Сохранить адрес", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(street) })).toBeVisible();
  expect(await json(await page.request.get(receiving))).toMatchObject({
    receiving: { address: street },
    availability: { available: true, inZone: null },
  });
});

test("#229 итог и минимум обновляются при первом выборе окна", tag, async ({ page, seller }) => {
  await hours(seller.request, "2");
  try {
    await prepareCart(page);
    await saveDelivery(page);
    await page.goto(cart);
    await page.getByRole("button", { name: /^Продолжить/ }).click();
    await expect(page).toHaveURL(/checkout\/receiving/);
    await expect(page.getByRole("button", { name: /^Выбрать время/ })).toBeEnabled();
    const priced = {
      ...zone,
      zones: zone.zones.map((item) => ({ ...item, tariff: { kind: "fixed" as const, feeMinor: 37000 } })),
    };
    await configure(seller.request, { delivery: priced, minimumMinor: 160000 });
    await page.getByRole("button", { name: /Когда привезти/ }).click();
    const time = page.getByRole("dialog", { name: /Когда привезти/ });
    await time.locator('input[type="radio"]:enabled').first().check();
    await time.getByRole("button", { name: /^Выбрать \d/ }).click();
    await expect(time).toBeHidden();
    await expect(page.getByText(/Добавьте товаров ещё на 34\s000/)).toBeVisible();
    await page.getByRole("button", { name: "В корзину" }).click();
    await expect(page.getByText(/37\s000/).first()).toBeVisible();
    await expect(page.getByText(/163\s000/).first()).toBeVisible();
  } finally {
    await configure(seller.request, { delivery: anywhere, minimumMinor: 120000 });
    await hours(seller.request, "2");
  }
});
