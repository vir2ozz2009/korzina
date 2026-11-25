import { expect, type Page } from "@playwright/test";

export async function checkPromoReportRevocation(page: Page) {
  const shop = { id: "fixture", slug: "test2", name: "Учебный магазин", permissions: [], promotions: true };
  await page.route(/\/api\/seller\/cabinet(?:\?|$)/, (route) =>
    route.fulfill({ json: { telegramId: "fixture-seller", current: shop, shops: [shop] } }),
  );
  const offer = {
    id: "fixture",
    revision: 1,
    status: "active",
    terms: {
      name: "Учебная акция",
      kind: "code",
      code: "K4TEST",
      discount: { type: "fixed", value: 11_000 },
      scope: { type: "all" },
      confirmed: false,
    },
  };
  await page.route(/\/api\/seller\/promotions(?:\?|$)/, (route) =>
    route.fulfill({ json: { offers: [offer], prices: [], currency: "VND", nextOffset: null } }),
  );
  await page.route(/\/api\/seller\/promotions\/fixture(?:\?|$)/, (route) => route.fulfill({ json: offer }));
  await page.route(/\/api\/seller\/promotions\/catalog(?:\?|$)/, (route) =>
    route.fulfill({ json: { variants: [], categories: [] } }),
  );
  let status = 200;
  await page.route(/\/api\/seller\/promotions\/fixture\/report(?:\?|$)/, (route) =>
    route.fulfill({
      status,
      json:
        status !== 200
          ? {}
          : {
              orderCount: 1,
              customers: 1,
              guestOrders: 0,
              deliveryMinor: 0,
              thresholdCount: 0,
              thresholdAverage: null,
              purchaseStats: [],
              itemsMinor: 55_000,
              savingsMinor: 11_000,
              orders: [
                {
                  number: 91,
                  completedAt: Date.now(),
                  name: "Учебный покупатель",
                  itemsMinor: 55_000,
                  savingMinor: 11_000,
                },
              ],
              nextOffset: null,
            },
    }),
  );
  const url = "/seller/promotions/fixture?store=test2";
  await page.goto(url);
  const detail = page.getByRole("button", { name: /Заказы с акцией/ });
  const order = page.getByRole("button", { name: /Заказ №91/ });
  const period = page.getByRole("button", { name: /За всё время|Последние 7 дней/ });
  const choosePeriod = async (label: string) => {
    await period.click();
    await page.getByRole("dialog", { name: "Период" }).getByRole("button", { name: label }).click();
  };
  await detail.click();
  await expect(order).toBeVisible();

  status = 503;
  await choosePeriod("Последние 7 дней");
  await expect(page.getByText("Не удалось загрузить результаты")).toBeVisible();
  status = 200;
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(order).toBeVisible();

  status = 403;
  await choosePeriod("За всё время");
  await expect(page.getByRole("alert")).toHaveText("Доступ к результатам ограничен");
  await expect(period).toHaveCount(0);
  await expect(order).toHaveCount(0);
  await expect(page.getByText("Сумма товаров в этих заказах")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Повторить" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Учебная акция" })).toBeVisible();
  await page.screenshot({ path: "test-results/promo-K4c-access-390.png", animations: "disabled" });
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText("Доступ к результатам ограничен");
  await expect(order).toHaveCount(0);
}
