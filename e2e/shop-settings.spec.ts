import { expect, type Page, test } from "@playwright/test";
import { checkSales } from "./seller-statistics";
import { checkShopHours } from "./shop-hours";

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

    await checkShopHours(page, query);
    await page.goto(`/seller/payments?${query}`);
    await expect(page.getByRole("button", { name: "Добавить способ" })).toBeVisible();
    await page.screenshot({ path: "test-results/shop-settings-payments-390.png", animations: "disabled" });
    await page.goto(`/seller/shop-data?${query}`);
    await expect(page.getByLabel("Название магазина")).toBeVisible();
    await page.screenshot({ path: "test-results/shop-settings-profile-390.png", animations: "disabled" });
    await test.step("12 · §12.6 название целиком помещается в шапке витрины", async () => {
      await checkStoreName(await buyer.newPage());
    });
    await page.goto(`/seller/shop-color?${query}`);
    await expect(page.getByText("Свой цвет", { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/shop-settings-color-390.png", animations: "disabled" });

    await test.step("§14.1 · главная, статистика и возврат со сбоем сводки", () => checkSales(page, local, query));
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
    if (local)
      await test.step("§12.5–§12.7 витрина черновика внутри кабинета", async () => {
        const status = "/__e2e/test2/status";
        expect((await seller.request.post(status, { data: "draft" })).status()).toBe(204);
        try {
          const guest = await buyer.newPage();
          await guest.goto("/?shop=test2");
          await expect(guest.getByText("Магазин скоро откроется")).toBeVisible();
          await page.goto(`/seller?${query}`);
          await page.getByRole("button", { name: "Открыть витрину как покупатель" }).click();
          await expect(page.getByRole("heading", { name: "Витрина глазами покупателя" })).toBeVisible();
          await expect(page.getByText("Предпросмотр для команды")).toBeVisible();
          await expect(page.getByRole("heading", { name: "Категории", exact: true })).toBeVisible();
          await page.screenshot({ path: "test-results/cabinet-storefront-390.png", animations: "disabled" });
          await page.getByRole("button", { name: /поиск/i }).click({ timeout: 7000 });
          await expect(page).toHaveURL(/\/search[?].*viewer=team/);
          await page.getByRole("button", { name: "Назад", exact: true }).click();
          await expect(page.getByRole("heading", { name: "Категории", exact: true })).toBeVisible();
          await page.getByRole("button", { name: "Вернуться в кабинет" }).click();
          await expect(page).toHaveURL(/\/seller[?].*store=test2/);
          await expect(page.getByRole("button", { name: "Открыть витрину как покупатель" })).toBeVisible();
        } finally {
          expect((await seller.request.post(status, { data: "active" })).status()).toBe(204);
        }
      });
    if (local)
      await test.step("Блок 8: команда, роль уведомлений и журнал", async () => {
        await page.goto(`/seller/more?${query}`);
        await page.getByRole("button", { name: "Сотрудники", exact: true }).click({ timeout: 7000 });
        await expect(page.getByRole("heading", { name: "Сотрудники", exact: true })).toBeVisible();
        await page.screenshot({ path: "test-results/team-390.png", animations: "disabled" });
        await page.getByRole("button", { name: "Добавить сотрудника", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Добавить сотрудника" })).toBeVisible();
        await page.screenshot({ path: "test-results/team-invite-390.png", animations: "disabled" });
        await page.goto(`/seller/bot?${query}`);
        await expect(page.getByText("Бота подключает администратор Korzina")).toBeVisible();
        await page.getByRole("button", { name: "Настроить уведомления сотрудников", exact: true }).click();
        await expect(page.getByRole("table", { name: "Уведомления по ролям" })).toBeVisible();
        await expect(page.getByRole("checkbox", { name: "Сборщик · Оплаты и чеки" })).toBeDisabled();
        const newOrders = page.getByRole("checkbox", { name: "Сборщик · Новые заказы" });
        const initial = await newOrders.isChecked();
        await newOrders.click();
        await expect(newOrders).toBeChecked({ checked: !initial });
        await newOrders.click();
        await expect(newOrders).toBeChecked({ checked: initial });
        await page.screenshot({ path: "test-results/team-notifications-390.png", animations: "disabled" });
        await page.goto(`/seller/history?${query}`);
        await expect(page.getByRole("button", { name: /Изменены уведомления/ }).first()).toBeVisible();
        await page.screenshot({ path: "test-results/team-history-390.png", animations: "disabled" });
      });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([seller.close(), buyer.close()]);
  }
});

async function checkStoreName(page: Page) {
  const name = "Семейная ферма с домашними сырами и сезонными продуктами";
  await page.route("**/?shop=test2", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /(<script id="shop-context" type="application\/json">)(.*?)(<\/script>)/u,
      (_, before, context, after) =>
        `${before}${JSON.stringify({ ...JSON.parse(context), name, profile: { logo: null } })}${after}`,
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/?shop=test2");
  const title = page.getByRole("button", { name: `О магазине ${name}` }).getByText(name, { exact: true });
  await expect(title).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 });
    expect
      .soft(
        await title.evaluate((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight),
        `${width}px`,
      )
      .toBe(true);
    if (width === 390)
      await page.screenshot({ path: "test-results/shop-settings-name-390.png", animations: "disabled" });
  }
  await page.getByRole("button", { name: `О магазине ${name}` }).click();
  await expect(page).toHaveURL(/\/about(?:\?shop=test2)?$/u);
}

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
