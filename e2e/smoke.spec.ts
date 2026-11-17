import { expect, test } from "@playwright/test";

test("витрина своего магазина → товар → шторка → назад", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await request.get("/api/shop?shop=test2");
  expect(response.ok()).toBe(true);
  const shop = await response.json();
  expect(shop.slug).toBe("test2");
  await page.goto("/?shop=test2");
  const bootstrap = await page.locator("#shop-context").textContent();
  expect(JSON.parse(bootstrap ?? "null").id).toBe(shop.id);
  await page.locator('a[href^="/p/demo"]').first().click();
  await expect(page).toHaveURL(/\/p\/demo/);
  await page.getByRole("button", { name: /Открыть фото 1:/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Увеличить фото" }).click();
  await page.getByRole("button", { name: "Закрыть фото" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator('a[href^="/p/demo/details"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/?\?shop=test2$/);
  await expect(page.locator('a[href^="/p/demo"]').first()).toBeVisible();
  await page.goto("/dev/templates/form?shop=test2");
  await page.getByLabel("Название магазина").fill("Изменённое название");
  await page.getByRole("link", { name: "home", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Выйти без сохранения?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Отмена" }).click();
  await expect(page).toHaveURL(/\/dev\/templates\/form/);
  await page.getByRole("link", { name: "home", exact: true }).click();
  await confirm.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page).toHaveURL(/\/dev\/templates\/home/);
  await page.goto("/dev/kit?shop=test2");
  await page.getByRole("button", { name: "Ввод", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "lazy.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nfixture\n"),
  });
  await expect(page.getByRole("button", { name: "Удалить lazy.pdf" })).toBeVisible();
  expect(errors).toEqual([]);
});
