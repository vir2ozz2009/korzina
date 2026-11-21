import { expect, type Page, test } from "@playwright/test";
import { verifyBuyerOrderReload, verifyFavoriteCart, verifyOrderCancellation, verifySavedAddress } from "./after-order";
import { verifyPaymentHelp } from "./payment-help";
import { chooseDeliveryAddress } from "./purchase-address";
import { checkChangedReceivingTime, checkClosedReceivingDay } from "./receiving-recheck";
import { verifySellerOrders } from "./seller-orders";

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

test("B10: товар, доставка и заказ наличными", async ({ page, browser, baseURL }) => {
  const local = !!baseURL && new URL(baseURL).hostname === "127.0.0.1";
  test.setTimeout(local ? 145_000 : 105_000);
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
  const onMap = await chooseDeliveryAddress(page);
  await page.getByRole("button", { name: /^Продолжить/ }).click();
  await expect(page).toHaveURL(/checkout\/receiving\?shop=test2/);
  if (onMap) {
    await page.getByRole("button", { name: /^Выбрать время/ }).click();
    const details = page.getByRole("dialog", { name: "Детали адреса" });
    await expect(details.getByRole("textbox", { name: "Квартира *", exact: true })).toBeFocused();
    await details.getByRole("textbox", { name: "Квартира *", exact: true }).fill("12А");
    await details.getByRole("button", { name: "Сохранить" }).click();
    await expect(details).toBeHidden();
  }
  await page.reload();
  if (onMap) await expect(page.getByText("кв. 12А")).toBeVisible();
  else await expect(page.getByText("28 Lê Lợi, Хошимин", { exact: true })).toBeVisible();
  await checkClosedReceivingDay(page);
  const chooseTime = async () => {
    await page.getByRole("button", { name: /Когда привезти/ }).click();
    const time = page.getByRole("dialog", { name: /Когда привезти/ });
    // The shop initially shows its first available day, which may be later than tomorrow.
    await time.locator('input[type="radio"]:enabled').first().check();
    await page.screenshot({ path: "test-results/receiving-time-390.png", animations: "disabled" });
    await time.getByRole("button", { name: /^Выбрать \d/ }).click();
    await expect(time).toBeHidden();
    await expect(page.getByRole("button", { name: /Когда привезти.*\d{2}:\d{2}/ })).toBeVisible();
  };
  await chooseTime();
  await checkChangedReceivingTime(page);
  await chooseTime();
  await expect(page.getByText("Время изменилось, выберите заново", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/receiving-390.png", animations: "disabled" });
  await page.getByRole("button", { name: /^К оплате/ }).click();
  await expect(page).toHaveURL(/checkout\/payment/);
  await expect(page.getByText("Номер для заказа")).toBeVisible();
  await verifyPaymentHelp(page, local);
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
  await page.getByRole("radio", { name: /^Наличные(?: при получении)?$/u }).check();
  await page.screenshot({ path: "test-results/payment-cash-390.png", animations: "disabled" });
  const checkout = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/checkout" && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Оформить заказ/ }).click();
  const response = await checkout;
  expect(response.request().postDataJSON()).toMatchObject({ payment: "cash" });
  expect(response.status()).toBe(201);
  const order: { number: number } = await response.json();
  await expect(page.getByRole("heading", { name: `Заказ №${order.number}` })).toBeVisible();
  await expect(page.getByText(/Оплатите.*при получении/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: `Заказ №${order.number}` })).toBeVisible();
  await page.screenshot({ path: "test-results/purchase-done-390.png", animations: "disabled" });
  await test.step("§13.1: после открытия заказа и перезагрузки остаётся магазин test2", () =>
    verifyBuyerOrderReload(page, order.number));
  await page.getByRole("button", { name: "К покупкам" }).click();
  await expect(page).toHaveURL(/\/\?shop=test2$/);
  await verifyOrderCancellation(page, order.number);
  await verifyFavoriteCart(page);
  await verifySavedAddress(page, onMap);
  if (local && baseURL) await verifySellerOrders(browser, baseURL);
});
