import { expect, type Locator, type Page } from "@playwright/test";
import {
  address,
  anywhere,
  command,
  configure,
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
const street = "45 Lê Lợi, Хошимин";
const outside = "12 rue de Rivoli, Paris";
const distant = { lat: 48.8566, lon: 2.3522 };
const cart = `/cart?${storefront}`;
const receiving = `/api/receiving?${storefront}`;
const editor = (page: Page) => page.getByRole("dialog", { name: "Редактировать адрес" });
const field = (form: Locator, name: string) => form.getByRole("textbox", { name, exact: true });
const row = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) });

test.beforeEach(async ({ seller, page }) => {
  await configure(seller.request, { delivery: anywhere, requiredDetails: [], minimumMinor: 120000 });
  await resume(seller.request);
  await page.route("**/api/receiving/geocode?**", (route) => {
    const input = route.request().postDataJSON();
    const results =
      input.type === "reverse"
        ? [{ address: street, ...input.point }]
        : input.address === "45 Lê Lợi"
          ? [{ address: street, ...point }]
          : input.address === "rue de Rivoli"
            ? [{ address: outside, ...distant }]
            : [];
    return route.fulfill({ json: { results } });
  });
  await prepareCart(page);
});

async function openSearch(page: Page) {
  await page.getByRole("button", { name: "Укажите адрес доставки", exact: true }).click();
  return page.getByRole("dialog", { name: "Новый адрес" });
}

async function suggest(search: Locator, text: string, choice: string) {
  await search.getByRole("searchbox").fill(text);
  await search.getByRole("button", { name: choice, exact: true }).click();
}

async function save(form: Locator) {
  await form.getByRole("button", { name: "Сохранить адрес", exact: true }).click();
  await expect(form).toBeHidden();
}

test(
  "address-edit (а) подсказка открывает форму, а квартира и подъезд сохраняются вместе с точкой",
  tag,
  async ({ page }, info) => {
    await page.goto(cart);
    await suggest(await openSearch(page), "45 Lê Lợi", street);
    const form = editor(page);
    await expect(field(form, "Адрес доставки")).toHaveValue(street);
    await expect(form.locator(".leaflet-marker-icon")).toBeVisible();
    for (const [name, value] of [
      ["Квартира", "24"],
      ["Подъезд", "2"],
      ["Этаж", "4"],
      ["Домофон", "24"],
      ["Комментарий", "У ворот"],
    ])
      await field(form, name).fill(value);
    await page.screenshot({ path: info.outputPath("address-edit-suggestion-390.png"), animations: "disabled" });
    await save(form);
    await expect(row(page, street)).toContainText("кв. 24");
    expect(await json(await page.request.get(receiving))).toMatchObject({
      receiving: {
        address: street,
        point,
        apartment: "24",
        entrance: "2",
        floor: "4",
        intercom: "24",
        comment: "У ворот",
      },
    });
  },
);

test("address-edit (б) геопозиция открывает форму, а правка улицы сбрасывает точку", tag, async ({ page }, info) => {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: point.lat, longitude: point.lon });
  await page.goto(cart);
  const search = await openSearch(page);
  await search.getByRole("button", { name: "Определить мою позицию", exact: true }).click();
  const form = editor(page);
  await expect(field(form, "Адрес доставки")).toHaveValue(street);
  await expect(form.locator(".leaflet-marker-icon")).toBeVisible();
  await page.screenshot({ path: info.outputPath("address-edit-location-390.png"), animations: "disabled" });
  await field(form, "Адрес доставки").fill(address);
  await expect(form.locator(".leaflet-marker-icon")).toHaveCount(0);
  await save(form);
  await expect(row(page, address)).toBeVisible();
  const { receiving: current } = await json<{ receiving: object }>(await page.request.get(receiving));
  expect(current).toMatchObject({ address });
  expect(current).not.toHaveProperty("point");
});

test("address-edit (в) произвольный адрес без подсказки принимается без проверки", tag, async ({ page }) => {
  let checks = 0;
  await page.route("**/api/receiving/verify-address?**", (route) => {
    checks++;
    return route.abort();
  });
  await page.goto(cart);
  const search = await openSearch(page);
  await search.getByRole("searchbox").fill("Дом за синими воротами");
  await expect(search.getByText(/Совпадений нет/)).toBeVisible();
  await search.getByRole("button", { name: "Ввести адрес вручную", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Ввести адрес вручную" });
  await expect(field(form, "Адрес доставки")).toHaveValue("Дом за синими воротами");
  await save(form);
  await expect(row(page, "Дом за синими воротами")).toBeVisible();
  expect(checks).toBe(0);
});

test("address-edit (г) сохранённый адрес из корзины открывается в редактируемой форме", tag, async ({ page }, info) => {
  const book = `/api/profile/addresses?${storefront}`;
  const { revision } = await json<{ revision: number }>(await page.request.get(book));
  await json(
    await page.request.post(book, {
      headers: command(),
      data: {
        action: "save",
        revision,
        title: "Дом QA1",
        receiving: { mode: "delivery", address, point, apartment: "12", entrance: "1" },
      },
    }),
  );
  await page.goto(cart);
  await page.getByRole("button", { name: "Укажите адрес доставки", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Адрес доставки" })
    .getByRole("button", { name: /^Дом QA1/ })
    .click();
  await row(page, address).click();
  const form = editor(page);
  await expect(field(form, "Квартира")).toHaveValue("12");
  await expect(field(form, "Подъезд")).toHaveValue("1");
  await field(form, "Квартира").fill("21");
  await field(form, "Подъезд").fill("3");
  await page.screenshot({ path: info.outputPath("address-edit-saved-390.png"), animations: "disabled" });
  await save(form);
  await expect(row(page, address)).toContainText("кв. 21");
  expect(await json(await page.request.get(receiving))).toMatchObject({
    receiving: { address, point, apartment: "21", entrance: "3" },
  });
});

test("address-edit (д) после Самовывоз → Доставка адрес на месте и редактируется", tag, async ({ page }) => {
  await saveDelivery(page);
  await page.goto(cart);
  await page.getByRole("radio", { name: "Самовывоз", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Самовывоз", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Доставка", exact: true }).click();
  await row(page, address).click();
  const form = editor(page);
  await expect(field(form, "Квартира")).toHaveValue("12");
  await field(form, "Квартира").fill("13");
  await save(form);
  await expect(row(page, address)).toContainText("кв. 13");
});

test("address-edit (е) зона отклоняет внешний адрес и принимает правку внутри", tag, async ({ page, seller }, info) => {
  await configure(seller.request, { delivery: zone });
  try {
    await page.goto(cart);
    const search = await openSearch(page);
    await suggest(search, "rue de Rivoli", outside);
    const form = editor(page);
    await expect(form.getByText("За пределами зоны доставки", { exact: true })).toBeVisible();
    await expect(form.getByRole("button", { name: "Сохранить адрес", exact: true })).toBeDisabled();
    await form.getByRole("button", { name: "Указать другой адрес", exact: true }).click();
    await suggest(search, "45 Lê Lợi", street);
    await expect(form.getByText("Доставка доступна", { exact: true })).toBeVisible();
    await field(form, "Квартира").fill("7");
    await page.screenshot({ path: info.outputPath("address-edit-zone-390.png"), animations: "disabled" });
    await save(form);
    await expect(row(page, street)).toContainText("кв. 7");
    expect(await json(await page.request.get(receiving))).toMatchObject({
      receiving: { address: street, point, apartment: "7" },
      availability: { available: true, inZone: true, zoneId: "center" },
    });
  } finally {
    await configure(seller.request, { delivery: anywhere });
  }
});
