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
  await page.locator('a[href^="/p/demo/details"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/?\?shop=test2$/);
  await expect(page.locator('a[href^="/p/demo"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});
