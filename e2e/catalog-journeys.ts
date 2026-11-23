import { expect, type Page } from "@playwright/test";
import { catalogDocumentContract } from "../src/shared/contracts/catalog";
import { checkContent } from "./content";

export async function browseCatalog(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/") && response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  const [catalogResponse, home] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/catalog/document"),
    page.goto("/?shop=test2"),
  ]);
  expect(home?.ok(), "Главная магазина test2 должна открываться").toBe(true);
  expect(catalogResponse.ok(), `Каталог test2: HTTP ${catalogResponse.status()}`).toBe(true);
  const catalog = catalogDocumentContract.parse(await catalogResponse.json());
  const root = catalog.categories.find(({ id }) => id === "home");
  if (!root || root.parentId !== null || !root.hasProducts)
    throw new Error("В каталоге test2 нужна видимая корневая категория home с товарами");
  const category = page.locator('a[href="/c/home"], a[href^="/c/home?"]');
  await category.scrollIntoViewIfNeeded();
  await expect(category).toHaveAccessibleName(root.name);
  const homeScroll = await page.evaluate(() => scrollY);
  await category.click();
  await expect(page).toHaveURL(/\/c\/home(?:\?|$)/);
  await expect(page.locator("article")).toHaveCount(3);
  await checkContent(page, "catalog");
  await page.screenshot({ path: "test-results/category-390.png", animations: "disabled" });
  for (const width of [360, 412]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  // Small height makes the real demo category scrollable.
  await page.setViewportSize({ width: 390, height: 300 });
  await page.evaluate(() => scrollTo(0, 400));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(await page.locator("header").evaluate((e) => e.getBoundingClientRect().top)).toBe(0);
  expect(await page.locator("header").evaluate((e) => e.getBoundingClientRect().height)).toBe(72);
  expect(
    await page.getByRole("navigation", { name: "Подкатегории" }).evaluate((e) => e.getBoundingClientRect().top),
  ).toBeLessThan(0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole("button", { name: "Томаты", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.locator("article a").last().scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  await page.locator("article a").last().click();
  await expect(page).toHaveURL(/\/p\/product-01/);
  const sizes = page.getByRole("group", { name: "Фасовка" });
  await sizes.getByRole("button", { name: "Набор 2 × 500 г", exact: true }).click();
  await expect(page.getByRole("group", { name: "Фото 2 из 2" })).toBeAttached();
  await sizes.getByRole("button", { name: "500 г", exact: true }).click();
  await expect(page.getByRole("group", { name: "Фото 1 из 2" })).toBeAttached();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Томаты", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
  await page.goBack();
  await expect(page).toHaveURL(/\/?\?shop=test2$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(homeScroll, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/categories?shop=test2");
  await expect(category).toBeVisible();
  await expect(page.getByRole("button", { name: "Все товары ›" })).toBeVisible();
  await expect(page.locator('a[href="/c/empty"],a[href^="/c/home-"]')).toHaveCount(0);
  await page.screenshot({ path: "test-results/categories-390.png", animations: "disabled" });
  await page.getByRole("button", { name: "Все бренды ›" }).click();
  await page.locator('a[href="/b/brand-1"]').click();
  await expect(page.locator("article").first()).toBeVisible();
  await checkContent(page, "catalog");
  await page.screenshot({ path: "test-results/brand-390.png", animations: "disabled" });
  await page.goto("/c/home?shop=test2");
  await expect(page.locator("article")).toHaveCount(3);
  await page.goto("/b/brand-1?shop=test2");
  await expect(page.locator("article").first()).toBeVisible();
  await page.goto("/categories?shop=test2");
  await page.getByRole("button", { name: "Все товары ›" }).click();
  await expect(page).toHaveURL(/\/catalog/);
  await checkContent(page, "catalog");
  await page.screenshot({ path: "test-results/all-products-390.png", animations: "disabled" });
  await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Цена до" }).fill("50000");
  const apply = page.getByRole("button", { name: /^Показать \d/ });
  await expect(apply).toBeEnabled();
  await page.screenshot({ path: "test-results/catalog-filters-390.png", animations: "disabled" });
  await apply.click();
  await expect(page).toHaveURL(/max=50000/);
  await page.getByRole("button", { name: "По умолчанию" }).click();
  await page.getByRole("radio", { name: "Сначала дешевле" }).click();
  await expect(page).toHaveURL(/sort=price-asc/);
  await page.locator("article a").first().click();
  await page.goBack();
  await expect(page).toHaveURL(/max=50000/);
  await expect(page.getByRole("button", { name: "Сначала дешевле" })).toBeVisible();
  expect(errors).toEqual([]);
}

export async function searchCatalog(page: Page) {
  await page.goto("/?shop=test2");
  await page.getByText("Нейропоиск", { exact: true }).click();
  const input = page.getByLabel("Поиск товаров");
  await expect(input).not.toBeFocused();
  const actions = page.locator("[data-shop-actions]");
  await expect(actions).toBeVisible();
  await expect(page.getByRole("heading", { name: "Попробуйте поискать" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Товары магазина" })).toBeVisible();
  await page.screenshot({ path: "test-results/search-start-390.png", animations: "disabled" });
  await input.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS("font-size", "16px");
  await expect(input).toHaveCSS("outline-color", "rgb(119, 119, 127)");
  await expect(actions).toBeVisible();
  await input.fill("молко");
  await expect(page.getByRole("button", { name: "молоко ›" })).toBeVisible();
  await expect(input).toHaveValue("молко");
  await page.getByRole("button", { name: "молоко ›" }).click();
  const milk = page.locator("article").filter({ hasText: "Молоко" }).first();
  await expect(input).toHaveValue("молоко");
  await expect(milk).toBeVisible();
  await page.screenshot({ path: "test-results/search-390.png", animations: "disabled" });
  await input.fill("молоко 500 мл");
  await page.getByRole("button", { name: "Искать товары" }).click();
  await milk.getByRole("button", { name: "Добавить в корзину" }).click();
  await expect(milk.getByText("1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Очистить запрос" }).click();
  await expect(actions).toBeVisible();
  await expect(actions).toContainText(/₫|₽|руб/);
  await expect(input).toHaveValue("");
  await page.screenshot({ path: "test-results/search-cleared-390.png", animations: "disabled" });
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page).toHaveURL(/\/\?shop=test2$/);
  await expect(actions).toContainText(/₫|₽|руб/);
}

export async function shopByList(page: Page) {
  await page.goto("/search?shop=test2");
  const input = page.getByLabel("Поиск товаров");
  await input.fill("молоко, томаты\nнеизвестнаяпозиция");
  await page.getByRole("button", { name: "Искать товары" }).click();
  await expect(page.getByRole("heading", { name: "молоко", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "томаты", exact: true })).toBeVisible();
  await expect(page.getByText("неизвестнаяпозиция", { exact: true })).toBeVisible();
  await expect(page.locator("[data-shop-actions]")).not.toContainText(/₫|₽/);
  const milk = page.locator("article").filter({ hasText: "Молоко" }).first();
  const tomatoes = page.locator("article").filter({ hasText: "Томаты" }).first();
  const milkBox = await milk.boundingBox();
  const tomatoBox = await tomatoes.boundingBox();
  expect(milkBox?.y).toBeCloseTo(tomatoBox?.y ?? -1, 0);
  expect(milkBox?.x).toBeLessThan(tomatoBox?.x ?? 0);
  await page
    .locator("article img")
    .evaluateAll((images) => Promise.all(images.map((img) => (img as HTMLImageElement).decode())));
  await page.screenshot({ path: "test-results/shopping-list-390.png", animations: "disabled" });
  await milk.getByRole("button", { name: "Выбрать фасовку" }).click();
  await expect(page.getByRole("heading", { name: "Выберите фасовку" })).toBeVisible();
  const pack = page.getByRole("dialog").locator("div.rounded-lg").filter({ hasText: "500 мл" }).first();
  const change = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/cart" && response.request().method() === "POST",
  );
  await pack.getByRole("button", { name: "Добавить в корзину" }).click();
  expect((await change).ok()).toBe(true);
  await page.keyboard.press("Escape");
  await expect(milk.getByText("1", { exact: true })).toBeVisible();
  const longList = Array(41).fill("молоко").join(", ");
  await input.fill(longList);
  await expect(page.getByRole("alert")).toContainText("40 позиций");
  await expect(input).toHaveValue(longList);
  await input.fill("я".repeat(4001));
  await expect(page.getByRole("alert")).toContainText("4000 символов");
  await expect(input).toHaveValue("я".repeat(4001));
  await input.fill("греческий салат");
  await page.getByRole("button", { name: "Искать товары" }).click();
  await expect(page.getByRole("heading", { name: "Для греческого салата" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Томаты" }).first()).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Огурцы" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/dish-search-390.png", animations: "disabled" });
}
