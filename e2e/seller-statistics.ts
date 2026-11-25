import { expect, type Page, type Route } from "@playwright/test";
import { calendarDate, shopDateTime } from "../src/shared/datetime";

export async function checkSales(page: Page, local: boolean, query: string) {
  const summary = "**/api/seller/statistics/summary?**";
  const failSummary = (route: Route) => route.fulfill({ status: 500, json: {} });
  if (!local) {
    const period = { from: "2026-11-17", to: "2026-11-23" };
    await page.route(summary, (route) =>
      route.fulfill({ json: { period, currency: "RUB", revenueMinor: 1896000, incomplete: false } }),
    );
    await page.route("**/api/seller/statistics/report?**", (route) =>
      route.fulfill({
        json: {
          period,
          currency: "RUB",
          timeZone: "Europe/Moscow",
          unit: "day",
          current: {
            revenueMinor: 1896000,
            orderCount: 24,
            positiveOrders: 24,
            averageMinor: 79000,
            incomplete: false,
          },
          previous: null,
          changes: null,
          revenueDifference: null,
          points: [],
          previousPoints: [],
        },
      }),
    );
    await page.route("**/api/seller/statistics/products?**", (route) => route.fulfill({ json: { period, rows: [] } }));
  }
  await page.route(summary, failSummary);
  const sales = page.getByRole("link", { name: "Статистика", exact: true });
  const failure = page.getByText("Не удалось загрузить выручку");
  await page.goto(`/seller?${query}`);
  await expect(failure).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
  await page.getByRole("button", { name: "Поделиться", exact: true }).click();
  await expect(page.getByText("Ссылка скопирована", { exact: true })).toBeVisible();
  if (local) {
    await page.getByRole("button", { name: "Открыть витрину как покупатель" }).click();
    await expect(page.getByRole("heading", { name: "Витрина глазами покупателя" })).toBeVisible();
    await page.getByRole("button", { name: "Вернуться в кабинет" }).click();
    await expect(failure).toBeVisible();
    await page.getByRole("button", { name: /^Сегодня/ }).click();
    await expect(page).toHaveURL(/\/seller\/orders[?].*day=/u);
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(failure).toBeVisible();
  }
  await page.getByRole("button", { name: "Приостановить приём", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Приостановить приём" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Приостановить приём" })).toBeHidden();
  await sales.click();
  await expect(page.getByRole("heading", { name: "Статистика", exact: true })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "График · Выручка" }).or(page.getByText("Нет продаж", { exact: true })),
  ).toBeVisible();
  await page.getByRole("button", { name: "Период", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "7 полных дней, по вчера включительно" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "test-results/seller-statistics-390.png", animations: "disabled" });
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page).toHaveURL(/\/seller[?].*store=test2/u);
  await expect(failure).toBeVisible();
  await page.unroute(summary, failSummary);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(failure).toBeHidden();
  await expect(sales).toHaveAttribute("href", /from=.*to=/u);
  await page.screenshot({ path: "test-results/seller-home-statistics-390.png", animations: "disabled" });
  const report = new URL((await sales.getAttribute("href")) ?? "/", page.url());
  await sales.press("Enter");
  await expect(page).toHaveURL(report.href);
  await page.goBack();
  await expect(page).toHaveURL(/\/seller[?].*store=test2/u);
  await checkProductReport(page, local, query);
  await page.goto(`/seller?${query}`);
}

async function checkProductReport(page: Page, local: boolean, query: string) {
  const product = "product-17";
  const timeZone = "Europe/Moscow";
  const { date: today } = shopDateTime(await page.evaluate(() => Date.now()), timeZone);
  const period = { from: calendarDate(today, -14), to: calendarDate(today, -1) };
  if (!local) {
    await page.route(`**/api/seller/statistics/products/${product}?**`, (route) =>
      route.fulfill({
        json: {
          period,
          currency: "RUB",
          name: "Куриное филе",
          quantity: 30,
          orderCount: 12,
          revenueMinor: 120000,
          incomplete: false,
          archived: false,
          variants: [{ id: "sku-20", unit: "350 г", archived: false }],
          timeZone,
          canOpenProduct: true,
        },
      }),
    );
  }
  const path = `/seller/statistics/products/${product}?${query}&from=${period.from}&to=${period.to}&variant=sku-20`;
  await page.goto(path);
  const open = page.getByRole("button", { name: "Открыть карточку товара", exact: true });
  await expect(open).toBeVisible();
  if (!local) await expect(page.getByText("При таком темпе за неделю — около 15 шт.")).toBeVisible();
  await page.screenshot({ path: "test-results/block11-product-statistics-390.png", animations: "disabled" });
  if (local) {
    await open.click();
    await expect(page).toHaveURL(/\/seller\/products\/product-17\?/u);
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page).toHaveURL(/\/seller\/statistics\/products\/product-17\?.*variant=sku-20/u);
    await expect(open).toBeVisible();
  }
}
