import { expect, test } from "@playwright/test";

test("Telegram BackButton survives reload and returns through catalog screens", async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `(() => {
        const noop = () => {};
        window.Telegram = { WebApp: {
          initData: '', viewportHeight: 844, isExpanded: true, colorScheme: 'light',
          ready: noop, expand: noop, setHeaderColor: noop, setBackgroundColor: noop,
          onEvent: noop, offEvent: noop,
          BackButton: {
            show: noop, hide: noop,
            onClick: fn => window.addEventListener('test-telegram-back', fn),
            offClick: fn => window.removeEventListener('test-telegram-back', fn)
          }
        }};
      })();`,
    }),
  );
  await page.goto("/?shop=test2#tgWebAppData=signed");
  await page.locator('a[href="/categories"]').click();
  await expect.poll(() => page.evaluate(() => !!window.Telegram?.WebApp)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("test-telegram-back")));
  await expect(page).toHaveURL((url) => url.pathname === "/" && !url.hash);
  await page.reload();
  await page.locator('a[href="/categories"]').click();
  const tabs = page.getByRole("navigation", { name: "Разделы каталога" });
  for (const name of ["Бренды", "Все товары", "Категории", "Бренды", "Категории"]) {
    await tabs.getByRole("link", { name, exact: true }).click();
    await expect(tabs.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  }
  const telegramBack = () => page.evaluate(() => window.dispatchEvent(new Event("test-telegram-back")));
  await telegramBack();
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("shop") === "test2");
  await page.locator('a[href="/categories"]').click();
  await page.locator('a[href="/c/home"]').click();
  await telegramBack();
  await expect(page).toHaveURL((url) => url.pathname === "/categories" && url.searchParams.get("shop") === "test2");
});
