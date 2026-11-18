import { expect, test } from "@playwright/test";

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
  await page.getByRole("button", { name: /^Корзина/ }).click();
  await page.getByRole("button", { name: "У меня нет Telegram" }).click();
  const login = page.getByRole("dialog", { name: "Войти в магазин" });
  await login.getByRole("textbox", { name: /Номер телефона/ }).fill("+84912345678");
  await expect(login.getByRole("button", { name: "Сохранить и продолжить" })).toBeDisabled();
  await login.getByRole("checkbox", { name: "Это мой номер телефона" }).check();
  await page.screenshot({ path: "test-results/checkout-contact-390.png", animations: "disabled" });
  await login.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await expect(login).toBeHidden();
  await expect(page.getByRole("button", { name: "Войти через Telegram" })).toHaveCount(0);
  await page.getByRole("button", { name: "Укажите адрес доставки", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Адрес доставки" });
  await sheet.getByRole("button", { name: "Ввести адрес вручную" }).click();
  await sheet.getByRole("textbox", { name: "Адрес доставки" }).fill("28 Lê Lợi, Хошимин");
  await sheet.getByRole("button", { name: "Использовать мой адрес как есть" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Согласуем после заказа")).toBeVisible();
  await page.screenshot({ path: "test-results/cart-address-390.png", animations: "disabled" });
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
  await page.getByRole("radio", { name: "Перевод", exact: true }).check();
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
