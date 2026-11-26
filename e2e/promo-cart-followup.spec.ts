import { expect, type Page, test } from "@playwright/test";
import type { PromoOffer } from "../src/shared/contracts/promo";

const offer: PromoOffer = {
  id: "proba",
  revision: 1,
  status: "draft",
  used: 0,
  orders: 0,
  savingsMinor: 0,
  terms: {
    name: "Скидка к выходным",
    kind: "code",
    code: "PROBA10",
    discount: { type: "percent", value: 1000 },
    scope: { type: "all" },
    confirmed: false,
    minimumMinor: 40_000,
  },
};
const products = [
  { id: "tomato", name: "500 г", productName: "Томаты розовые", priceMinor: 8000 },
  { id: "berry", name: "250 г", productName: "Клубника", priceMinor: 28000 },
  { id: "cucumber", name: "500 г", productName: "Огурцы", priceMinor: 6500 },
];
const pickup = { address: "Москва, ул. Садовая, 7", hours: "Ежедневно, 09:00–20:00" };
const money = (value: number) => new RegExp(value.toLocaleString("ru-RU").replace(/\s/gu, "\\s") + "\\s*₽");

async function exampleFixture(page: Page) {
  const shop = { id: "test-shop", slug: "test2", name: "Korzina", promotions: true, permissions: ["catalog"] };
  const writes: string[] = [];
  await page.route(/\/api\/(cart|checkout|quote|receiving|orders)(\/|\?|$)/, (route) => {
    writes.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 500 });
  });
  await page.route(/\/api\/seller\/cabinet(?:\?|$)/, (route) =>
    route.fulfill({ json: { telegramId: "fixture", current: shop, shops: [shop] } }),
  );
  await page.route(/\/api\/seller\/promotions(?:\/[^?]+)?(?:\?|$)/, (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/proba")) return route.fulfill({ json: { ...offer, currency: "RUB" } });
    if (pathname.endsWith("/catalog"))
      return route.fulfill({
        json: { variants: products.map((product) => ({ ...product, productId: product.id })), categories: [] },
      });
    if (pathname.endsWith("/report")) return route.fulfill({ status: 503 });
    if (!pathname.endsWith("/example"))
      return route.fulfill({
        json: { offers: [offer], prices: [], currency: "RUB", nextOffset: null },
      });
    const { enteredCode, lines } = route.request().postDataJSON() as {
      enteredCode: string | null;
      lines: { variantId: string; quantity: number }[];
    };
    const base = lines.reduce(
      (sum, line) => sum + (products.find(({ id }) => id === line.variantId)?.priceMinor ?? 0) * line.quantity,
      0,
    );
    const applied = enteredCode === "PROBA10" && base >= 40_000;
    const adjustments = applied
      ? [{ kind: "promotion", sourceId: "example", label: "По промокоду PROBA10", amount: -base / 10 }]
      : [];
    const totalMinor = base - (applied ? base / 10 : 0);
    const result = lines.map(({ variantId, quantity }) => {
      const product = products.find(({ id }) => id === variantId);
      if (!product) throw new Error("Неизвестный тестовый товар");
      return {
        variantId,
        productId: variantId,
        name: product.productName,
        unit: product.name,
        quantity,
        stock: 15,
        available: true,
        priceMinor: product.priceMinor,
        totalMinor: product.priceMinor * quantity * (applied ? 0.9 : 1),
      };
    });
    return route.fulfill({
      json: {
        lines: result,
        itemsMinor: base,
        totalMinor,
        payableMinor: totalMinor,
        adjustments,
        revision: 0,
        currency: "RUB",
        promo: enteredCode
          ? {
              code: enteredCode,
              reason: applied ? "applied" : enteredCode === "PROBA10" ? "minimum" : "unknown",
              missingMinor: Math.max(0, 40_000 - base),
            }
          : {},
        fulfillment: { pickup, acceptingOrders: true },
        method: "pickup",
        deliveryMinor: 0,
      },
    });
  });
  return writes;
}

for (const width of [360, 390]) {
  test(`§5.3 · штатная корзина и шторка из черновика на ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const writes = await exampleFixture(page);
    await page.goto("/seller/promotions/proba?store=test2");
    await page.getByRole("button", { name: "Открыть черновик" }).click();
    await page.getByRole("button", { name: "Посмотреть, как видит покупатель" }).click();
    await expect(page.getByRole("heading", { name: "Корзина" })).toBeVisible();
    const settings = page.locator("details").filter({ hasText: "Тестовые данные · не видны покупателю" });
    await expect(page.getByText("Корзина пуста")).toBeVisible();
    for (const id of ["tomato", "berry"]) {
      await settings.getByLabel("Фасовка", { exact: true }).selectOption(id);
      await settings.getByRole("button", { name: "Добавить товар" }).click();
    }
    await settings.getByLabel("Клубника · 250 г").fill("4");
    if (await settings.evaluate((node: HTMLDetailsElement) => node.open)) await settings.locator("summary").click();
    const checkout = page.getByRole("button", { name: /^Продолжить/ });
    await expect(checkout).toHaveText(money(1200));
    await expect(checkout).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath(`preview-before-${width}.png`) });
    await page.getByRole("button", { name: "Промокод", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Промокод" });
    const input = sheet.getByRole("textbox", { name: "Промокод" });
    await expect(input).toHaveValue("");
    await page.screenshot({ path: test.info().outputPath(`preview-sheet-${width}.png`) });
    await input.fill("WRONG");
    await sheet.getByRole("button", { name: "Применить" }).click();
    await expect(sheet.getByText("Код не найден")).toBeVisible();
    await input.fill("PROBA10");
    await sheet.getByRole("button", { name: "Применить" }).click();
    await expect(checkout).toHaveText(money(1080));
    await expect(page.getByText(money(72), { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`preview-applied-${width}.png`) });
    const berry = page.getByRole("listitem").filter({ hasText: "Клубника" });
    for (let i = 0; i < 3; i++) await berry.getByRole("button", { name: "Уменьшить количество" }).click();
    await expect(checkout).toHaveText(money(360));
    for (let i = 0; i < 3; i++) await berry.getByRole("button", { name: "Увеличить количество" }).click();
    await expect(checkout).toHaveText(money(1080));
    await page.getByRole("button", { name: "PROBA10", exact: true }).click();
    await sheet.getByRole("button", { name: "Убрать" }).click();
    await expect(checkout).toHaveText(money(1200));
    await expect(checkout).toBeDisabled();
    await page.getByRole("button", { name: "Закрыть корзину" }).click();
    await expect(page.getByRole("heading", { name: "Перед запуском" })).toBeVisible();
    await page.getByRole("button", { name: "Изменить условия" }).click();
    await expect(page.getByLabel("Код", { exact: true })).toHaveValue("PROBA10");
    expect(writes).toEqual([]);
  });
}
