import { expect, test } from "@playwright/test";
import { checkContent } from "./content";

test("B3: категории → подкатегория → товар → назад; бренд и прямые ссылки", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/") && response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/?shop=test2");
  const category = page.locator('a[href="/c/home"]');
  await category.scrollIntoViewIfNeeded();
  const homeScroll = await page.evaluate(() => scrollY);
  await category.click();
  await expect(page.locator("article")).toHaveCount(2);
  await checkContent(page, "catalog");
  await page.screenshot({ path: "test-results/category-390.png" });
  for (const width of [360, 412]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  // Small height makes the real two-product demo category scrollable, without fake API data.
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
  await page.goBack();
  await expect(page.getByRole("button", { name: "Томаты", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
  await page.goBack();
  await expect(page).toHaveURL(/\/?\?shop=test2$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(homeScroll, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/categories?shop=test2");
  await expect(page.locator('a[href="/c/home"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /Все товары/ })).toHaveCount(0);
  await expect(page.locator('a[href="/c/empty"],a[href^="/c/home-"]')).toHaveCount(0);
  await page.screenshot({ path: "test-results/categories-390.png" });
  await page.getByRole("button", { name: "Все бренды ›" }).click();
  await page.locator('a[href="/b/brand-1"]').click();
  await expect(page.locator("article").first()).toBeVisible();
  await checkContent(page, "catalog");
  await page.screenshot({ path: "test-results/brand-390.png" });
  await page.goto("/c/home?shop=test2");
  await expect(page.locator("article")).toHaveCount(2);
  await page.goto("/b/brand-1?shop=test2");
  await expect(page.locator("article").first()).toBeVisible();
  expect(errors).toEqual([]);
});
