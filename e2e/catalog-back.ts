import { expect, type Page } from "@playwright/test";

export async function checkCatalogBack(page: Page) {
  const home = () => expect(page).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("shop") === "test2");
  for (const back of [() => page.goBack(), () => page.getByRole("button", { name: "Назад", exact: true }).click()]) {
    await page.goto("/?shop=test2");
    await page.locator('a[href="/categories"]').click();
    const tabs = page.getByRole("navigation", { name: "Разделы каталога" });
    for (const name of ["Бренды", "Все товары", "Категории", "Бренды", "Категории"]) {
      await tabs.getByRole("link", { name, exact: true }).click();
      await expect(tabs.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    }
    await page.locator('a[href="/c/home"]').click();
    await page.locator("article a").first().click();
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/c/home");
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/categories");
    await tabs.getByRole("link", { name: "Бренды", exact: true }).click();
    await page.locator('a[href="/b/brand-1"]').click();
    await page.locator("article a").first().click();
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/b/brand-1");
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/brands");
    await back();
    await home();
  }
  const direct = await page.context().newPage();
  await direct.goto("/b/brand-1?shop=test2");
  await direct.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(direct).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("shop") === "test2");
  await direct.close();
  const telegram = await page.context().newPage();
  await telegram.addInitScript(() => {
    const noop = () => {};
    window.Telegram = {
      WebApp: {
        initData: "",
        viewportHeight: 844,
        isExpanded: true,
        colorScheme: "light",
        ready: noop,
        expand: noop,
        setHeaderColor: noop,
        setBackgroundColor: noop,
        onEvent: noop,
        offEvent: noop,
        BackButton: {
          show: noop,
          hide: noop,
          onClick: (fn) => window.addEventListener("test-telegram-back", fn),
          offClick: (fn) => window.removeEventListener("test-telegram-back", fn),
        },
      },
    };
  });
  await telegram.goto("/?shop=test2&telegram=1");
  await telegram.locator('a[href="/categories"]').click();
  const telegramTabs = telegram.getByRole("navigation", { name: "Разделы каталога" });
  for (const name of ["Бренды", "Все товары", "Категории"]) {
    await telegramTabs.getByRole("link", { name, exact: true }).click();
    await expect(telegramTabs.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await telegram.evaluate(() => window.dispatchEvent(new Event("test-telegram-back")));
  await expect(telegram).toHaveURL((url) => url.pathname === "/" && url.searchParams.get("shop") === "test2");
  await telegram.close();
}
