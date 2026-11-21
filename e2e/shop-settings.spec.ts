import { expect, type Page, test } from "@playwright/test";

const query = "shop=test2&store=test2";
const fixtureShop = {
  id: "korzina-demo-test2",
  slug: "test2",
  name: "Магазин",
  status: "active",
  role: "owner",
  storefrontUrl: "/?shop=test2",
};

test("Блок 7: продавец сохраняет настройки и проверяет видимую и тихую паузу", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const local = baseURL ? new URL(baseURL).hostname === "127.0.0.1" : false;
  const seller = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const buyer = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const page = await seller.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    if (local) expect((await seller.request.post("/__e2e/test2/seller")).status()).toBe(204);
    else await previewSettings(page);
    await page.goto(`/seller/more?${query}`);
    await page.getByRole("button", { name: "Доставка и самовывоз", exact: true }).click();
    const minimum = page.getByLabel("Минимальная сумма заказа");
    await expect(minimum).toBeVisible();
    const oldMinimum = await minimum.inputValue();
    await minimum.fill(String(Number(oldMinimum) + 100));
    await expect(page.getByText("Несохранённые изменения")).toBeVisible();
    await page.screenshot({ path: "test-results/shop-settings-delivery-390.png", animations: "disabled" });
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByText("Несохранённые изменения")).toBeHidden();
    await minimum.fill(oldMinimum);
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByText("Несохранённые изменения")).toBeHidden();

    await page.goto(`/seller/hours?${query}`);
    await expect(page.getByRole("switch", { name: "Разные часы для доставки и самовывоза" })).toBeVisible();
    await page.screenshot({ path: "test-results/shop-settings-hours-390.png", animations: "disabled" });
    await page.goto(`/seller/payments?${query}`);
    await expect(page.getByRole("button", { name: "Добавить способ" })).toBeVisible();
    await page.screenshot({ path: "test-results/shop-settings-payments-390.png", animations: "disabled" });
    await page.goto(`/seller/shop-data?${query}`);
    await expect(page.getByLabel("Название магазина")).toBeVisible();
    await page.screenshot({ path: "test-results/shop-settings-profile-390.png", animations: "disabled" });
    await page.goto(`/seller/shop-color?${query}`);
    await expect(page.getByText("Свой цвет", { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/shop-settings-color-390.png", animations: "disabled" });

    await page.goto(`/seller?${query}`);
    const show = page.getByRole("button", { name: "Приостановить приём", exact: true });
    const resume = page.getByRole("button", { name: "Возобновить", exact: true });
    const pause = page.getByRole("dialog", { name: "Приостановить приём" });
    const banner = "Вернёмся позже";
    await show.click();
    await pause.getByRole("button", { name: "Доставка", exact: true }).click();
    await pause.getByLabel("Сообщение покупателям").fill(banner);
    await expect(pause.getByText(banner, { exact: false }).last()).toBeVisible();
    await page.screenshot({ path: "test-results/shop-settings-pause-390.png", animations: "disabled" });
    if (local) {
      await pause.getByRole("button", { name: "Приостановить", exact: true }).click();
      await expect(pause).toBeHidden();
      const storefront = await buyer.newPage();
      await storefront.goto("/?shop=test2");
      await expect(storefront.getByRole("status").filter({ hasText: banner })).toBeVisible();
      await storefront.screenshot({ path: "test-results/shop-settings-banner-390.png", animations: "disabled" });
      await resume.first().click();
      await expect(resume).toHaveCount(0);
      await storefront.reload();
      await expect(storefront.getByText(banner, { exact: false })).toHaveCount(0);
      await show.click();
      await pause.getByRole("button", { name: "Доставка", exact: true }).click();
    }
    await pause.getByRole("switch", { name: "Показывать плашку на витрине" }).uncheck();
    await expect(pause.getByText("Доставка · Сейчас недоступно")).toBeVisible();
    await page.screenshot({ path: "test-results/shop-settings-quiet-390.png", animations: "disabled" });
    if (local) {
      await pause.getByRole("button", { name: "Приостановить", exact: true }).click();
      await expect(pause).toBeHidden();
      const state = await (await buyer.request.get("/api/receiving?shop=test2")).json();
      expect(state).toMatchObject({
        banner: null,
        acceptingOrders: true,
        unavailable: { delivery: "Сейчас недоступно" },
      });
      await resume.first().click();
      await expect(resume).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([seller.close(), buyer.close()]);
  }
});

async function previewSettings(page: Page) {
  const revision = { revision: 0, canWrite: true };
  let minimumMinor = 120000;
  await page.route("**/api/seller/cabinet?**", (route) =>
    route.fulfill({
      json: { telegramId: "fixture", current: fixtureShop, shops: [fixtureShop] },
    }),
  );
  await page.route(/\/api\/seller\/(receiving|payments|profile)\//u, (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/seller/", "");
    if (path === "receiving/settings" && route.request().method() === "PUT")
      minimumMinor = route.request().postDataJSON().minimumMinor;
    const payload: Record<string, object> = {
      "receiving/settings": {
        maps: true,
        mapsFallback: false,
        minimumMinor,
        currency: "VND",
        requiredDetails: ["apartment"],
        delivery: { mode: "text", payee: "shop", tariff: { kind: "fixed", feeMinor: 25000 } },
        pickup: { address: "45 Lê Lợi", hours: "09:00–20:00" },
      },
      "receiving/hours": { settings: null, schedule: null },
      "receiving/pause": {
        adminPaused: false,
        timeZone: "Asia/Ho_Chi_Minh",
        methods: [
          { method: "delivery", pause: null },
          { method: "pickup", pause: null },
        ],
      },
      "payments/settings": {
        options: [
          { id: "cash", template: "cash", name: "Наличные при получении", enabled: true, requiresReceipt: false },
        ],
      },
      "profile/data": {
        profile: { name: "Магазин", logo: null, timeZone: "Asia/Ho_Chi_Minh" },
        country: "VN",
        currency: "VND",
        maps: true,
      },
      "profile/theme": { theme: { preset: "raspberry" } },
    };
    return route.fulfill({ json: { ...revision, ...payload[path] } });
  });
}
