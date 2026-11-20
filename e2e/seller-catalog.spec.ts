import { expect, test } from "@playwright/test";

test("Блок 6: товар с новой категорией сохраняется, витрина обновляется, пауза сохраняет остаток", async ({
  browser,
  baseURL,
}) => {
  test.skip(!baseURL?.startsWith("http://127.0.0.1"), "Тест использует локальную сессию продавца");
  const seller = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
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
    const tile = page.locator("[data-mosaic-id]").first().locator("[data-size]");
    const wasLarge = (await tile.getAttribute("data-size")) === "2x2";
    await page.getByRole("button", { name: wasLarge ? "Маленькая" : "Большая" }).click();
    await expect(tile).toHaveAttribute("data-size", wasLarge ? "1x1" : "2x2");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ещё" })).toBeVisible();
  } finally {
    await Promise.all([seller.close(), buyer.close()]);
  }
});
