import { expect, type Page, test } from "@playwright/test";
import { type Candidate, calculatePromo } from "../server/modules/promo/calculate";
import { cartTotals } from "../src/shared/cart-totals";
import type { CartLine } from "../src/shared/contracts/cart";

export async function checkCartClarity(page: Page, shop = "test2") {
  const lines: CartLine[] = [
    {
      variantId: "berry",
      productId: "berry",
      name: "Голубика",
      unit: "125 г",
      quantity: 1,
      priceMinor: 40000,
      stock: 20,
      available: true,
    },
    {
      variantId: "milk",
      productId: "milk",
      name: "Молоко",
      unit: "500 мл",
      quantity: 1,
      priceMinor: 31000,
      stock: 20,
      available: true,
    },
    {
      variantId: "extra",
      productId: "extra",
      name: "Посторонний товар",
      unit: "1 шт.",
      quantity: 1,
      priceMinor: 100000,
      stock: 20,
      available: true,
    },
  ];
  const offer: Candidate = {
    id: "clarity",
    revision: 1,
    status: "active",
    used: 0,
    personalUsed: 0,
    terms: {
      name: "Комбо тест",
      kind: "automatic",
      confirmed: false,
      scope: { type: "all" },
      discount: { type: "fixed", value: 0 },
      group: {
        type: "bundle",
        priceMinor: 60000,
        limit: 2,
        components: [
          { variantId: "berry", quantity: 1 },
          { variantId: "milk", quantity: 1 },
        ],
      },
    },
  };
  let code: string | undefined;
  let mode = "delivery";
  let revision = 1;
  const sale: Candidate = {
    ...offer,
    id: "sale",
    terms: { ...offer.terms, group: undefined, kind: "code", code: "SALE", discount: { type: "percent", value: 1000 } },
  };
  const combo: Candidate = { ...offer, id: "coded", terms: { ...offer.terms, kind: "code", code: "COMBO" } };
  const cart = () =>
    calculatePromo(
      { revision, currency: "VND", ...cartTotals(lines) },
      code === "COMBO" ? [combo] : code ? [sale] : [offer],
      { confirmed: true, completed: 0, exactUsed: false },
      (terms) => terms.name,
      code,
    );
  await page.unrouteAll({ behavior: "wait" });
  await page.route(/\/api\/(cart|receiving|checkout\/summary|auth\/(guest|contact))(\/|\?|$)/, (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/cart/promotions") return route.fulfill({ json: [] });
    if (path.startsWith("/api/auth/")) return route.fulfill({ json: { phone: null, telegramLinked: true } });
    if (path === "/api/receiving/availability") return route.fulfill({ json: { mode: "after_order", days: [] } });
    if (path === "/api/receiving") {
      if (request.method() === "POST") {
        mode = request.postDataJSON().receiving?.mode ?? request.postDataJSON().mode;
        revision++;
      }
      return route.fulfill({
        json: {
          revision,
          effectiveMode: mode,
          receiving: mode === "pickup" ? { mode } : null,
          pickup: { address: "28 Lê Lợi", hours: "09:00–20:00" },
          delivery: { mode: "text", payee: "shop" },
          unavailable: {},
          acceptingOrders: true,
          savedAddresses: [],
          requiredDetails: [],
          availability: null,
        },
      });
    }
    if (path === "/api/cart") {
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        if (input.promoAction) code = input.code;
        const line = lines.find((line) => line.variantId === input.variantId);
        if (line) line.quantity = input.quantity;
        revision++;
      }
      return route.fulfill({ json: cart() });
    }
    return route.fulfill({
      json: { ...cart(), deliveryMinor: 0, acceptingOrders: true, shortMinor: 0, minimumMinor: 0, availability: null },
    });
  });
  const money = (amount: number) =>
    new Intl.NumberFormat("ru-RU", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
  for (const width of [360, 390]) {
    code = undefined;
    mode = "delivery";
    lines[0].quantity = lines[1].quantity = 1;
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/?shop=${shop}`);
    await page.getByRole("button", { name: /^Корзина/ }).click();
    await expect(page.getByRole("radio", { name: "Доставка", exact: true })).toBeChecked();
    await page.screenshot({ path: test.info().outputPath(`clarity-cart-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: /Комбо тест ·/ }).click();
    const dialog = page.getByRole("dialog", { name: "Комбо тест" });
    await expect(dialog).toContainText(`За набор — ${money(60000)}`);
    await expect(dialog).toContainText(`Экономия ${money(11000)}`);
    await expect(dialog).not.toContainText("Посторонний товар");
    await expect(dialog).not.toContainText("Итого за товары");
    await expect(dialog).toContainText("Молоко · 500 мл × 1");
    await page.screenshot({ path: test.info().outputPath(`clarity-bundle-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await checkDetailsBack(page, shop);
    await page.getByRole("radio", { name: "Самовывоз", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Самовывоз", exact: true })).toBeChecked();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Самовывоз", exact: true })).toBeChecked();
    await page.getByRole("button", { name: "Промокод", exact: true }).click();
    await page.getByRole("textbox", { name: "Промокод" }).fill("SALE");
    await page.getByRole("button", { name: "Применить", exact: true }).click();
    await expect(page.getByText("Применён к товарам без скидки", { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`clarity-code-${width}.png`), fullPage: true });
    code = "COMBO";
    lines[0].quantity = lines[1].quantity = 3;
    await page.reload();
    await expect(page.getByText("Применён к товарам без скидки", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /Комбо тест ·/ }).click();
    await expect(dialog).toContainText(`Стоимость наборов — ${money(120000)}`);
    await expect(dialog).toContainText("По акции 2 из 3 наборов");
    await page.screenshot({ path: test.info().outputPath(`clarity-limit-${width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
  }
}

async function checkDetailsBack(page: Page, shop: string) {
  const dialog = page.getByRole("dialog", { name: "Комбо тест" });
  const trigger = page.getByRole("button", { name: /Комбо тест ·/ });
  // Capture the real cart position after the trigger has been scrolled into view.
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(dialog).toBeHidden();
  await trigger.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => ({ index: history.state.__TSR_index, length: history.length, y: scrollY }));
  const lines = await page.getByRole("listitem").allTextContents();
  const unchanged = async () => {
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/cart\\?shop=${shop}$`));
    await expect(trigger).toBeFocused();
    expect(await page.getByRole("listitem").allTextContents()).toEqual(lines);
    await expect(page.getByRole("radio", { name: "Доставка", exact: true })).toBeChecked();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(before.y, 0);
    expect(await page.evaluate(() => ({ index: history.state.__TSR_index, length: history.length }))).toEqual({
      index: before.index,
      length: before.length,
    });
    await expect(page.getByText("Посторонний товар", { exact: true })).toBeVisible();
  };
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await unchanged();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await unchanged();
  await trigger.click();
  await expect(dialog).toBeVisible();
  // Vaul suppresses dragging during its first 500 ms after opening.
  await page.waitForTimeout(550);
  const box = await dialog.boundingBox();
  if (!box) throw new Error("Missing combo sheet");
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10, { steps: 12 });
  await page.mouse.up();
  await unchanged();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/\\?shop=${shop}$`));
  await page.getByRole("button", { name: /^Корзина/ }).click();
  await expect(trigger).toBeVisible();
}
