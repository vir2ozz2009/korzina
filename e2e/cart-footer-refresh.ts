import { expect, type Page, test } from "@playwright/test";

// Same cart revision: seller changes applicability, not the buyer's cart command.
// Shared by the promo journey and the nightly cart regression.
export async function checkCartFooterRefresh(
  page: Page,
  width: number,
  disable: () => void,
  reprice: (priceMinor: number) => void,
) {
  const money = (value: number) => new RegExp(value.toLocaleString("ru-RU").replace(/\s/gu, "\\s"));
  const next = page.locator("button").filter({ hasText: /^Продолжить/ });
  const total = page.getByText("Итого", { exact: true }).locator("..");
  const dialog = page.getByRole("dialog", { name: "Комбо тест" });
  await expect(next).toContainText(money(291000));
  await expect(dialog).toBeVisible();
  for (const [price, amount] of [
    [65000, 301000],
    [60000, 291000],
  ]) {
    reprice(price);
    await page.clock.fastForward(30_000);
    await expect(total).toContainText(money(amount));
    await expect(next).toContainText(money(amount));
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: /Комбо тест ·/ }).click();
    }
    await expect(dialog).toContainText(money(price * 2));
  }
  disable();
  await page.clock.fastForward(30_000);
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Код больше не действует", { exact: true })).toBeVisible();
  await expect(total).toContainText(money(313000));
  await expect(next).toContainText(money(313000));
  await expect(next).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath(`footer-refresh-${width}.png`), fullPage: true });
  // A second periodic refresh must keep both consumers in agreement.
  await page.clock.fastForward(30_000);
  await expect(total).toContainText(money(313000));
  await expect(next).toContainText(money(313000));
  await next.click();
  await expect(page).toHaveURL(/\/checkout\/receiving/);
}
