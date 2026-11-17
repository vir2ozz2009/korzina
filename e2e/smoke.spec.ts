import { expect, type Page, test } from "@playwright/test";
import { checkContent } from "./content";

async function checkWidths(page: Page, screen?: "home" | "product") {
  if (screen) await checkContent(page, screen);
  for (const width of [360, 412]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    if (screen) await checkContent(page, screen);
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth > innerWidth,
      text: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((el) =>
          Array.from(el.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()),
        )
        .filter(
          (el) =>
            el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible",
        )
        .map((el) => el.textContent?.trim().slice(0, 80)),
    }));
    expect(overflow, `${width}px`).toEqual({ page: false, text: [] });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test("витрина своего магазина → фасовка/корзина → товар → шторка → назад", async ({ page, request }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/") && response.status() >= 400)
      errors.push(`API ${response.status()}: ${response.url()}`);
  });
  const response = await request.get("/api/shop?shop=test2");
  expect(response.ok()).toBe(true);
  const shop = await response.json();
  expect(shop.slug).toBe("test2");
  await page.goto("/?shop=test2");
  expect(JSON.parse((await page.locator("#shop-context").textContent()) ?? "null").id).toBe(shop.id);
  await page.locator("article").first().waitFor();
  if (process.env.E2E_BASE_URL) await page.screenshot({ path: "test-results/demo-home.png" });
  await checkWidths(page, "home");
  const first = page.locator("article").first();
  await first.getByRole("button", { name: "Выбрать фасовку" }).click();
  const variants = page.getByRole("dialog", { name: "Выберите фасовку" });
  await expect(variants).toBeVisible();
  let releaseFirst = () => {};
  const held = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const revisions: number[] = [];
  await page.route("**/api/cart?**", async (route) => {
    if (route.request().method() === "POST") {
      revisions.push(route.request().postDataJSON().expectedRevision);
      if (revisions.length === 1) await held;
    }
    await route.continue();
  });
  await variants.getByRole("button", { name: "Добавить в корзину" }).first().click();
  await expect.poll(() => revisions.length).toBe(1);
  await page.goBack();
  await expect(variants).toHaveCount(0);
  const second = page.locator("article").nth(1);
  // A slow change of the first product must not disable another tile.
  await second.getByRole("button", { name: "Выбрать фасовку" }).click();
  await variants.getByRole("button", { name: "Добавить в корзину" }).first().click();
  await expect(variants.locator('[aria-busy="true"]')).toHaveCount(1);
  expect(revisions).toEqual([0]);
  releaseFirst();
  await expect(variants.getByLabel("В корзине", { exact: true })).toHaveText("1");
  expect(revisions).toEqual([0, 1]);
  await page.goBack();
  await expect(variants).toHaveCount(0);
  await expect(second.getByLabel("В корзине", { exact: true })).toHaveText("1");
  await expect(page.getByRole("button", { name: /^Корзина/ })).toBeVisible();
  await expect(first.getByLabel("В корзине", { exact: true })).toHaveText("1");
  const link = page.locator('a[href^="/p/"]').nth(6);
  await link.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => window.scrollY);
  const href = await link.getAttribute("href");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}\\?shop=test2$`));
  await checkWidths(page, "product");
  await page.getByRole("button", { name: /Открыть фото 1:/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Увеличить фото" }).click();
  await page.getByRole("button", { name: "Закрыть фото" }).click();
  await page.getByRole("link", { name: "Подробнее о товаре" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/?\?shop=test2$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await expect(first.getByLabel("В корзине", { exact: true })).toHaveText("1");
  await page.getByRole("button", { name: /^Корзина/ }).click();
  await expect(page.getByText("250 г · 1 шт.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("250 г · 1 шт.")).toBeVisible();
  await page.goto("/dev/kit?shop=test2");
  await page.getByRole("button", { name: "Товары", exact: true }).click();
  await checkWidths(page);
  await page.getByRole("button", { name: "Шаблоны", exact: true }).click();
  await page.getByRole("button", { name: "form", exact: true }).click();
  await page.getByLabel("Название магазина").fill("Изменённое название");
  await page.getByRole("link", { name: "Korzina — главная", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Выйти без сохранения?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Отмена" }).click();
  await expect(page).toHaveURL(/\/dev\/kit/);
  await page.getByRole("link", { name: "Korzina — главная", exact: true }).click();
  await confirm.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page).toHaveURL(/\/?\?shop=test2$/);
  await page.goto("/dev/kit?shop=test2");
  await page.getByRole("button", { name: "Ввод", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "lazy.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nfixture\n") });
  await expect(page.getByRole("button", { name: "Удалить lazy.pdf" })).toBeVisible();
  expect(errors).toEqual([]);
});
