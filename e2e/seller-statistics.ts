import { expect, type Page, type Route } from "@playwright/test";

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
}
