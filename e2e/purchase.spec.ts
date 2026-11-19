import { expect, type Page, test } from "@playwright/test";

async function keyboardViewport(page: Page, open: boolean) {
  await page.evaluate((open) => {
    const viewport = window.visualViewport;
    if (!viewport) throw new Error("VisualViewport is unavailable");
    for (const [property, value] of [
      ["height", 412],
      ["offsetTop", 32],
    ] as const) {
      if (open) Object.defineProperty(viewport, property, { configurable: true, value });
      else Reflect.deleteProperty(viewport, property);
    }
    viewport.dispatchEvent(new Event("resize"));
  }, open);
}

test("B10: товар, доставка и заказ наличными", async ({ page }) => {
  test.setTimeout(80_000);
  page.setDefaultTimeout(12_000);
  await page.goto("/p/product-17?shop=test2&variant=sku-20");
  const cartWrite = () =>
    page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/cart" && response.request().method() === "POST",
    );
  let saved = cartWrite();
  await page.getByRole("button", { name: "Добавить в корзину", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  for (let quantity = 2; quantity <= 3; quantity++) {
    saved = cartWrite();
    await page.getByRole("button", { name: "Добавить одну штуку", exact: true }).click();
    expect((await saved).ok()).toBe(true);
  }
  await page.screenshot({ path: "test-results/purchase-product-390.png", animations: "disabled" });
  const cart = page.getByRole("button", { name: /^Корзина/ });
  await cart.click();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page).toHaveURL(/\/p\/product-17.*shop=test2/);
  await cart.click();
  await page.getByRole("button", { name: "У меня нет Telegram" }).click();
  const login = page.getByRole("dialog", { name: "Войти в магазин" });
  const phone = login.getByRole("textbox", { name: /Номер телефона/ });
  await expect(phone).toHaveValue(/^\+84\s*$/);
  await phone.fill("+84912345678");
  await keyboardViewport(page, true);
  await expect.poll(async () => (await login.boundingBox())?.y ?? 1000).toBeLessThan(412);
  await expect
    .poll(async () => {
      const field = await phone.boundingBox();
      return field ? field.y + field.height : 1000;
    })
    .toBeLessThan(444);
  await login.dispatchEvent("pointerdown", { pointerType: "touch", clientY: 110 });
  await login.dispatchEvent("pointermove", { pointerType: "touch", clientY: 290 });
  await login.dispatchEvent("pointerup", { pointerType: "touch", clientY: 330 });
  await expect(phone).toHaveValue("+84912345678");
  await keyboardViewport(page, false);
  await login.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await expect(login.getByRole("alert")).toHaveText("Подтвердите номер галочкой, чтобы продолжить.");
  await login.getByRole("checkbox", { name: "Это мой номер телефона" }).check();
  await page.screenshot({ path: "test-results/checkout-contact-390.png", animations: "disabled" });
  await login.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await expect(login).toBeHidden();
  await expect(page.getByRole("button", { name: "Войти через Telegram" })).toHaveCount(0);
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
        status: 429,
        json: { error: { code: "RATE_LIMITED", message: "Повторите поиск чуть позже" } },
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
  await search.getByRole("button", { name: "Сохранить адрес вручную" }).click();
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
  await page.getByRole("button", { name: /^Продолжить/ }).click();
  await expect(page).toHaveURL(/checkout\/receiving\?shop=test2/);
  await page.getByRole("button", { name: /^Выбрать время/ }).click();
  const details = page.getByRole("dialog", { name: "Детали адреса" });
  await expect(details.getByRole("textbox", { name: "Квартира *", exact: true })).toBeFocused();
  await details.getByRole("textbox", { name: "Квартира *", exact: true }).fill("12А");
  await details.getByRole("button", { name: "Сохранить" }).click();
  await expect(details).toBeHidden();
  await page.reload();
  await expect(page.getByText("кв. 12А")).toBeVisible();
  await page.getByRole("button", { name: /Когда привезти/ }).click();
  const time = page.getByRole("dialog", { name: /Когда привезти/ });
  await time.getByRole("button", { name: "Завтра", exact: true }).click();
  await time.locator('input[type="radio"]:enabled').first().check();
  await page.screenshot({ path: "test-results/receiving-time-390.png", animations: "disabled" });
  await time.getByRole("button", { name: /^Выбрать \d/ }).click();
  await expect(time).toBeHidden();
  await expect(page.getByRole("button", { name: /Когда привезти.*\d{2}:\d{2}/ })).toBeVisible();
  await page.screenshot({ path: "test-results/receiving-390.png", animations: "disabled" });
  await page.getByRole("button", { name: /^К оплате/ }).click();
  await expect(page).toHaveURL(/checkout\/payment/);
  await expect(page.getByText("Номер для заказа")).toBeVisible();
  await page.getByRole("button", { name: "Проблема с оплатой?" }).click();
  const help = page.getByRole("dialog", { name: "Помощь с оплатой" });
  await expect(help.getByRole("link", { name: "Поддержка demo" })).toHaveAttribute(
    "href",
    "mailto:shop@example.invalid",
  );
  await help.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ваш заказ", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Перевод", exact: true }).check();
  const inlineQr = page.getByRole("img", { name: "QR для перевода" });
  await expect(inlineQr).toBeVisible();
  await expect.poll(() => inlineQr.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/payment-qr-inline-390.png", animations: "disabled" });
  await page.getByRole("button", { name: "QR крупнее" }).click();
  const qr = page.getByRole("dialog", { name: "QR для перевода" });
  await expect(qr.getByRole("img", { name: "QR для перевода" })).toBeVisible();
  await qr.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.locator('input[type="file"][aria-label="Чек"]').setInputFiles({
    name: "demo-receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nfixture\n"),
  });
  await expect(page.getByText("demo-receipt.pdf")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Оформить заказ/ })).toBeEnabled();
  await page.screenshot({ path: "test-results/payment-receipt-390.png", animations: "disabled" });
  await page.reload();
  await expect(page.getByText("demo-receipt.pdf")).toBeVisible();
  await page.locator('input[type="file"][aria-label="Чек"]').setInputFiles({
    name: "demo-replacement.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nreplacement\n"),
  });
  await expect(page.getByText("demo-replacement.pdf")).toBeVisible();
  await expect(page).toHaveURL(/checkout\/payment/);
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Оформить заказ/ })).toBeDisabled();
  await page.getByRole("radio", { name: "Наличные", exact: true }).check();
  await page.screenshot({ path: "test-results/payment-cash-390.png", animations: "disabled" });
  const checkout = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/checkout" && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Оформить заказ/ }).click();
  const response = await checkout;
  expect(response.status()).toBe(201);
  const order: { number: number } = await response.json();
  await expect(page.getByRole("heading", { name: `Заказ №${order.number}` })).toBeVisible();
  await expect(page.getByText(/Оплатите.*при получении/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: `Заказ №${order.number}` })).toBeVisible();
  await page.screenshot({ path: "test-results/purchase-done-390.png", animations: "disabled" });
  await page.getByRole("button", { name: "К покупкам" }).click();
  await expect(page).toHaveURL(/\/\?shop=test2$/);
});
