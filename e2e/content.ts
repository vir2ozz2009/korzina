import { expect, type Page } from "@playwright/test";

const price = /\d[\d\s.,]*[₫₽$€£]/;
export async function checkContent(page: Page, screen: "home" | "product") {
  await page.evaluate(() => document.fonts.ready);
  if (screen === "home") {
    await expect.soft(page.getByRole("heading", { name: "Категории", exact: true })).toBeVisible();
    await expect.soft(page.locator('nav[aria-label="Категории"] > *').first()).toBeVisible();
    await expect.soft(page.locator("article").first()).toContainText(price);
  } else {
    await expect.soft(page.locator("h1")).not.toBeEmpty();
    await expect.soft(page.locator("#screen-content")).toContainText(price);
    // Figma 47 reserves the bottom for the SKU buy bar, without home floating actions.
    await expect.soft(page.getByRole("button", { name: /^Корзина|^Поиск$/ })).toHaveCount(0);
    const plus = page
      .getByRole("button", { name: /^(Добавить в корзину|Выбрать фасовку|Добавить одну штуку)$/ })
      .last();
    await expect.soft(plus).toBeVisible();
    await plus.scrollIntoViewIfNeeded();
    await expect
      .soft(
        plus.evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return !!target && (target === button || button.contains(target));
        }),
      )
      .resolves.toBe(true);
  }
  await expect.soft
    .poll(
      () =>
        page.evaluate((kind) => {
          const visible = (el: Element) => {
            const r = el.getBoundingClientRect();
            return (
              r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0
            );
          };
          const missing = Array.from(document.images)
            .filter((img) => visible(img.parentElement ?? img))
            .filter((img) => !img.complete || img.naturalWidth === 0)
            .map((img) => img.currentSrc || img.src);
          // SVG <image> has no complete/naturalWidth. Reuse the browser cache
          // through Image probes, retained across polls without repeated requests.
          const state = window as Window & { smokePhotos?: Map<string, HTMLImageElement> };
          state.smokePhotos ??= new Map();
          for (const svgImage of document.querySelectorAll<SVGImageElement>("svg image")) {
            if (!visible(svgImage.closest("svg") ?? svgImage)) continue;
            const src = svgImage.href.baseVal;
            let probe = state.smokePhotos.get(src);
            if (!probe) {
              probe = new Image();
              probe.src = src;
              state.smokePhotos.set(src, probe);
            }
            if (!probe.complete || !probe.naturalWidth) missing.push(src);
          }
          const photos =
            kind === "home"
              ? Array.from(document.querySelectorAll("article")).filter(visible)
              : Array.from(document.querySelectorAll('[aria-label^="Открыть фото 1:"]'));
          for (const photo of photos)
            if (!photo.querySelector("img")) missing.push(`Нет фото: ${photo.getAttribute("aria-label") ?? "плитка"}`);
          if (kind === "product" && !photos.length) missing.push("Нет фото товара");
          return missing;
        }, screen),
      { timeout: 10_000, message: `Все фото первого экрана ${screen} загружены` },
    )
    .toEqual([]);
  await page.evaluate(async () => {
    const probes = (window as Window & { smokePhotos?: Map<string, HTMLImageElement> }).smokePhotos?.values() ?? [];
    await Promise.all(
      [...document.images, ...probes].filter((img) => img.complete && img.naturalWidth > 0).map((img) => img.decode()),
    );
  });
  if (page.viewportSize()?.width === 390)
    await page.screenshot({ path: `test-results/${screen}-390.png`, animations: "disabled" });
}
