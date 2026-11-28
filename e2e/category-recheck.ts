import { expect, type Page } from "@playwright/test";
import { expectCategoryFrames } from "./photo-frames";

export async function checkCategorySettings(page: Page, buyer: Page) {
  const sizes = [
    ["1x1", "Маленькая"],
    ["2x1", "Широкая"],
    ["1x2", "Высокая"],
    ["2x2", "Большая"],
  ] as const;
  const first = page.locator("[data-mosaic-id]").first();
  const id = await first.getAttribute("data-mosaic-id");
  for (const [size, label] of sizes) {
    await first.getByRole("button").click();
    await page.getByRole("button", { name: label, exact: true }).click();
    for (const width of [360, 390, 412]) {
      await page.setViewportSize({ width, height: 844 });
      await expectCategoryFrames(page.getByRole("navigation", { name: "Категории", exact: true }), [size]);
      await page.screenshot({ path: `test-results/category-settings-${size}-${width}.png`, animations: "disabled" });
    }
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ещё", exact: true })).toBeVisible();
    await buyer.goto("/?shop=test2");
    await expect(buyer.locator(`a[href="/c/${id}"]`)).toHaveAttribute("data-size", size);
    await buyer.reload();
    for (const width of [360, 390, 412]) {
      await buyer.setViewportSize({ width, height: 844 });
      await expectCategoryFrames(buyer.getByRole("navigation", { name: "Категории", exact: true }), [size]);
      await buyer.screenshot({ path: `test-results/category-saved-${size}-${width}.png`, animations: "disabled" });
    }
    await page.getByRole("button", { name: "Витрина", exact: true }).click();
  }
  await buyer.close();
}
