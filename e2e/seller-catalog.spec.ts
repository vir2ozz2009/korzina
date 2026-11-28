import { type BrowserContext, expect, test } from "@playwright/test";
import { checkCategorySettings } from "./category-recheck";

test("Блок 6: товар с новой категорией сохраняется, витрина обновляется, пауза сохраняет остаток", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  test.skip(!baseURL?.startsWith("http://127.0.0.1"), "Тест использует локальную сессию продавца");
  const viewport = { width: 390, height: 844 };
  const seller = await browser.newContext({
    baseURL,
    viewport,
    extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.83" },
  });
  // Fixture IP belongs to local API requests, not the external image host.
  await seller.route("https://media.demo.korzina.app/**", async (route) => {
    const headers = await route.request().allHeaders();
    delete headers["cf-connecting-ip"];
    await route.continue({ headers });
  });
  const buyer = await browser.newContext({ baseURL });
  try {
    expect((await seller.request.post("/__e2e/test2/seller")).status()).toBe(204);
    const page = await seller.newPage();
    await page.goto("/seller/products?shop=test2&store=test2");
    await expect(page.getByRole("heading", { name: "Товары" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Добавить товар" })).toBeVisible();
    await page.screenshot({ path: "test-results/seller-catalog-390.png", animations: "disabled" });
    await page.getByRole("button", { name: "Добавить товар" }).click();
    const suffix = String(Date.now()).slice(-8);
    const name = `Яблочный сок ${suffix}`;
    const group = `Свежий урожай ${suffix}`;
    await page.getByLabel("Название", { exact: true }).fill(name);
    await page.getByRole("button", { name: /Категория Без категории/ }).click();
    await page.getByRole("button", { name: "Создать категорию", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Создать категорию" });
    await sheet.getByLabel("Название", { exact: true }).fill(group);
    await sheet.getByRole("button", { name: "Сохранить категорию" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByLabel("Название", { exact: true })).toHaveValue(name);
    await expect(page.getByRole("button", { name: new RegExp(group) })).toBeVisible();
    await page.getByLabel("Цена", { exact: true }).fill("24000");
    await page.getByLabel("Остаток", { exact: true }).fill("4");
    await page.screenshot({ path: "test-results/seller-product-390.png", animations: "disabled" });
    const created = page.waitForResponse(
      (response) => response.url().includes("/api/seller/catalog/products?") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    const { product } = await (await created).json();
    expect(product).toMatchObject({ name, status: "selling", variants: [{ priceMinor: 24000, stock: 4 }] });
    await expect(page.getByRole("heading", { name: "Товары" })).toBeVisible();
    await page.getByRole("searchbox").fill(name);
    const row = page.locator("[data-product-status]").filter({ hasText: name });
    await expect(row).toHaveAttribute("data-product-status", "selling");
    const storefront = () => buyer.request.get(`/api/catalog/products/${product.id}?shop=test2`);
    expect(await (await storefront()).json()).toMatchObject({ name, variants: [{ stock: 4, available: true }] });
    await row.getByRole("switch", { name: `В продаже: ${name}` }).click();
    await page.getByRole("button", { name: "Пока не верну" }).click();
    await expect(row).toHaveAttribute("data-product-status", "unavailable");
    expect(await (await storefront()).json()).toMatchObject({ variants: [{ stock: 4, available: false }] });
    await row.getByRole("switch", { name: `В продаже: ${name}` }).click();
    await expect(row).toHaveAttribute("data-product-status", "selling");
    await page.getByRole("checkbox", { name: `Выбрать товар: ${name}` }).check();
    await page.getByRole("button", { name: "Действия", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Действия с товарами" });
    await expect(menu.getByRole("button", { name: "Перенести в категорию" })).toBeVisible();
    await page.screenshot({ path: "test-results/seller-catalog-actions-390.png", animations: "disabled" });
    await menu.getByRole("button", { name: "Скрыть", exact: true }).click();
    await expect(row).toHaveAttribute("data-product-status", "hidden");
    expect((await storefront()).status()).toBe(404);
    await page.getByRole("button", { name: "Ещё", exact: true }).click();
    await page.getByRole("button", { name: "Витрина", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Витрина" })).toBeVisible();
    await page.locator("[data-mosaic-id]").first().getByRole("button").click();
    await expect(page.getByRole("button", { name: "Большая" })).toBeVisible();
    await page.screenshot({ path: "test-results/seller-catalog-mosaic-390.png", animations: "disabled" });
    await checkCategorySettings(page, await buyer.newPage());
    await page.locator("[data-mosaic-id]").first().getByRole("button").click();
    const tile = page.locator("[data-mosaic-id]").first().locator("[data-size]");
    const wasLarge = (await tile.getAttribute("data-size")) === "2x2";
    await page.getByRole("button", { name: wasLarge ? "Маленькая" : "Большая" }).click();
    await expect(tile).toHaveAttribute("data-size", wasLarge ? "1x1" : "2x2");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ещё" })).toBeVisible();
    const editor = await browser.newContext({
      baseURL,
      viewport,
      storageState: { cookies: await seller.cookies(), origins: [] },
      extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.84" },
    });
    try {
      await checkProductEditor(editor, { id: product.id, name });
    } finally {
      await editor.close();
    }
  } finally {
    await Promise.all([seller.close(), buyer.close()]);
  }
});

async function checkProductEditor(seller: BrowserContext, product: { id: string; name: string }) {
  const page = await seller.newPage();
  const search = new URLSearchParams({ shop: "test2", store: "test2", q: product.name });
  await page.goto(`/seller/products?${search}`);
  const productRow = page
    .locator("[data-product-status]")
    .filter({ hasText: product.name })
    .getByRole("button")
    .first();
  const save = page.getByRole("button", { name: "Сохранить", exact: true });
  await test.step("06 · повторное открытие берёт сохранённый режим и ревизию", async () => {
    await productRow.click();
    await expect(page.getByRole("radio", { name: "Автоматически" })).toBeChecked();
    const detail = `**/api/seller/catalog/products/${product.id}?*`;
    let releaseRefresh = () => {};
    const refresh = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    await page.route(detail, async (route) => {
      if (route.request().method() === "GET") await refresh;
      await route.continue();
    });
    try {
      const manual = page.getByRole("radio", { name: "Выбрать вручную" });
      await manual.check();
      await save.click();
      await productRow.click();
      await expect(manual.or(page.locator('main [aria-busy="true"]')).first()).toBeAttached();
      releaseRefresh();
      await expect(manual).toBeChecked({ timeout: 2000 });
      await page.getByRole("radio", { name: "Выключены" }).check();
      await save.click();
      await expect(productRow).toBeVisible();
      const saved = await seller.request.get(`/api/seller/catalog/products/${product.id}?store=test2`);
      expect(await saved.json()).toMatchObject({ recommendations: "off" });
    } finally {
      releaseRefresh();
      await page.unroute(detail);
    }
  });
  await test.step("11 · пустое и повторяющееся названия отмечаются в поле фасовки", async () => {
    await productRow.click();
    const variantName = page.getByRole("textbox", { name: "Название фасовки" });
    await expect(page.getByRole("textbox", { name: "Цена", exact: true })).toBeVisible();
    await expect(variantName).toHaveCount(0);
    await page.getByRole("button", { name: "Фасовка", exact: true }).click();
    await page.getByLabel("Цена", { exact: true }).fill("30000");
    await page.getByRole("switch", { name: "Без лимита" }).check();
    const done = page.getByRole("button", { name: "Готово", exact: true });
    await done.click();
    await save.click();
    await expect(variantName).toHaveAttribute("aria-invalid", "true", { timeout: 2000 });
    await variantName.fill("Бутылка");
    await done.click();
    await page.getByRole("button", { name: /Название фасовки/ }).click();
    await variantName.fill(" бутылка ");
    await done.click();
    await save.click();
    await expect(variantName).toHaveAttribute("aria-invalid", "true");
    await expect(variantName).toHaveValue(" бутылка ");
    await variantName.fill("Большая");
    await done.click();
    await save.click();
    await expect(productRow).toBeVisible();
    const saved = await seller.request.get(`/api/seller/catalog/products/${product.id}?store=test2`);
    expect(await saved.json()).toMatchObject({ variants: [{ name: "Бутылка" }, { name: "Большая" }] });
  });
}
