import { expect, type Page } from "@playwright/test";

export async function checkDeliveryLayout(page: Page, name = "buyer-code-390") {
  await page.evaluate(() => document.fonts.ready);
  for (const width of [360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => {
      const elements = [...document.querySelectorAll<HTMLElement>("main p, main span, main strong, main button")];
      return {
        page: document.documentElement.scrollWidth > innerWidth,
        text: elements
          .filter((element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.textContent),
      };
    });
    expect(overflow).toEqual({ page: false, text: [] });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ animations: "disabled", path: `test-results/a6/${name}.png` });
}
