import { expect, type Locator, type Page } from "@playwright/test";
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
    await page.locator('[data-mosaic-id="milk"]').getByRole("button").click();
    await page.getByRole("button", { name: label, exact: true }).click();
    for (const width of [360, 390, 412]) {
      await page.setViewportSize({ width, height: 844 });
      await expectCategoryFrames(page.getByRole("navigation", { name: "Категории", exact: true }), [size]);
      await captureTiles(
        page,
        page.locator("[data-mosaic-id]"),
        "data-mosaic-id",
        [id, "milk"],
        `settings-${size}-${width}`,
      );
    }
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ещё", exact: true })).toBeVisible();
    await buyer.goto("/?shop=test2");
    await expect(buyer.locator(`a[href="/c/${id}"]`)).toHaveAttribute("data-size", size);
    await buyer.reload();
    await expect(buyer.locator('a[href="/c/milk"]')).toHaveAttribute("data-size", size);
    for (const width of [360, 390, 412]) {
      await buyer.setViewportSize({ width, height: 844 });
      await expectCategoryFrames(buyer.getByRole("navigation", { name: "Категории", exact: true }), [size]);
      await captureTiles(
        buyer,
        buyer.locator("a[data-size]"),
        "href",
        [`/c/${id}`, "/c/milk"],
        `saved-${size}-${width}`,
      );
    }
    await page.getByRole("button", { name: "Витрина", exact: true }).click();
  }
  await buyer.close();
}

async function captureTiles(page: Page, tiles: Locator, attribute: string, ids: (string | null)[], name: string) {
  for (const [index, id] of ids.entries()) {
    const tile = tiles.and(page.locator(`[${attribute}="${id}"]`));
    await tile.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }),
    );
    await tile
      .locator("img")
      .evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode())));
    // Scroll offsets are integral while mosaic cells have fractional CSS widths.
    // Allow less than one CSS pixel at the rail edge, never a cropped photo.
    await expect(tile).toBeInViewport({ ratio: 0.99 });
    expect(
      await tile.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const rail = element.closest("nav")?.getBoundingClientRect();
        if (!rail) throw new Error("Category rail missing");
        return Math.max(rail.left - box.left, box.right - rail.right, -box.top, box.bottom - innerHeight, 0);
      }),
    ).toBeLessThan(1);
    await tile.screenshot({
      path: `test-results/category-${name}-${index === 1 ? "milk" : "bakery"}.png`,
      animations: "disabled",
    });
  }
}
