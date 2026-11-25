import { expect, type Page, test } from "@playwright/test";
import type { OrderResult } from "../src/shared/contracts/checkout";
import type { StorefrontReceiving } from "../src/shared/contracts/receiving-time";
import type { SellerOrder } from "../src/shared/contracts/seller-order";
import { calendarDate, formatShopDay } from "../src/shared/datetime";
import { freshPage } from "./fresh-page";
import { checkOrderChanges } from "./order-changes";
import { placePickup, preparePickup } from "./seller-orders";
import { checkCalendarBudget, checkOrderPagination, checkShopHeaders } from "./workday-regressions";
import { checkWorkdayShare } from "./workday-share";

test("Блок 9 · ближайшее получение, рабочий день и заказы в сборке", async ({ browser, baseURL }) => {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Нужна локальная учебная сессия кабинета");
  test.setTimeout(95_000);
  const [buyer, seller] = await Promise.all([
    browser.newContext({ baseURL, extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.91" } }),
    browser.newContext({ baseURL, extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.92" } }),
  ]);
  const fixture = "/__e2e/test2/workday";
  try {
    expect((await seller.request.post("/__e2e/test2/seller")).status()).toBe(204);
    expect((await buyer.request.get("/api/shop?shop=test2")).ok()).toBe(true);
    expect((await seller.request.post(fixture, { data: "setup" })).status()).toBe(204);
    const storefront = await buyer.newPage();
    await storefront.goto("/?shop=test2");
    const availability: StorefrontReceiving = await (await buyer.request.get("/api/receiving/next?shop=test2")).json();
    expect(availability.methods.some(({ method }) => method === "pickup")).toBe(true);
    for (const entry of availability.methods) {
      let text: string;
      if (entry.mode === "after_order") {
        text =
          entry.method === "delivery"
            ? "Время доставки согласуем после заказа"
            : "Время самовывоза согласуем после заказа";
      } else if (entry.mode === "unknown") {
        text = "Время уточнит магазин после заказа";
      } else {
        if (!entry.date) throw new Error("У ближайшего получения должна быть дата");
        if (entry.mode === "slots" && !entry.start) throw new Error("У ближайшего интервала должно быть начало");
        const label = entry.method === "delivery" ? "Ближайшая доставка" : "Самовывоз";
        const day =
          entry.date === availability.today
            ? "сегодня"
            : entry.date === calendarDate(availability.today, 1)
              ? "завтра"
              : formatShopDay(entry.date, availability.timeZone).toLowerCase();
        text = `${label}: ${day}${entry.mode === "slots" ? ` с ${entry.start?.replace(/^0/u, "")}` : ""}`;
      }
      await expect(storefront.getByText(text, { exact: true }).first()).toBeVisible();
    }
    await expect(storefront.locator("body")).not.toContainText(/(?:^|[^\p{L}])закрыто(?:$|[^\p{L}])/iu);
    await storefront.screenshot({ path: "test-results/workday-storefront-390.png", animations: "disabled" });

    const order = await placePickup(buyer.request, true);
    const pickup = availability.methods.find(({ method }) => method === "pickup");
    const date = order.time?.date;
    const slot = order.time?.slotId;
    if (!date || !slot || !pickup) throw new Error("Нужен заказ на интервал самовывоза");
    expect(date).toBe(availability.today);
    expect(date).toBe(pickup.date);
    expect(slot).toBe(`${pickup.start}-${pickup.end}`);
    const messagePath = `/__e2e/test2/order-message?queued=1&number=${order.number}&now=${Date.now()}`;
    await expect
      .poll(async () => {
        const response = await seller.request.post(messagePath);
        return response.ok() ? response.json() : null;
      })
      .toMatchObject({
        recipient: "990000001",
        text: expect.stringMatching(new RegExp(`^Новый заказ №${order.number} · `)),
      });
    const cabinet = await seller.newPage();
    await cabinet.goto("/seller?store=test2");
    const receipt = cabinet.getByRole("button", { name: /^Проверить чек/ });
    await expect(receipt).toBeVisible();
    await expect(cabinet.getByRole("heading", { name: "По этапам" })).toBeVisible();
    await cabinet.screenshot({ path: "test-results/workday-home-390.png", animations: "disabled" });
    await receipt.click();
    const find = () => cabinet.getByRole("button", { name: `Открыть заказ №${order.number}`, exact: true });
    await expect(find()).toBeVisible();
    await cabinet.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(cabinet.getByRole("heading", { name: "Главная" })).toBeVisible();

    await cabinet.getByRole("button", { name: "Календарь", exact: true }).click();
    await expect(cabinet.getByRole("heading", { name: "Календарь", exact: true })).toBeVisible();
    const formattedDate = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(date),
    );
    await cabinet.screenshot({ path: "test-results/workday-calendar-390.png", animations: "disabled" });
    await cabinet.getByRole("button", { name: new RegExp(`^${formattedDate},`) }).click();
    await expect(find()).toBeVisible();

    await cabinet.goto("/seller?store=test2");
    await cabinet.getByRole("button", { name: /^Ближайшие:/ }).click();
    await expect(cabinet.getByRole("heading", { name: "Список сборки", exact: true })).toBeVisible();
    const packingUrl = new URL(cabinet.url());
    expect(packingUrl.pathname).toBe("/seller/workday/packing");
    expect(packingUrl.searchParams.get("day")).toBe(date);
    expect(packingUrl.searchParams.get("window")).toBe(slot);
    await expect(cabinet.getByRole("button", { name: "По времени", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const window = cabinet.locator(`[id="packing-${slot}"]`);
    await expect(window.getByRole("heading")).toBeInViewport();
    await window.getByRole("button", { name: new RegExp(order.lines[0].name, "u") }).click();
    await expect(
      cabinet.getByRole("dialog").getByRole("button", { name: new RegExp(`^№${order.number} ·`) }),
    ).toBeVisible();
    await cabinet.getByRole("dialog").getByRole("button", { name: "Закрыть" }).click();
    await cabinet.getByRole("button", { name: "Весь день", exact: true }).click();
    const product = cabinet.getByRole("button", { name: new RegExp(order.lines[0].name, "u") }).first();
    await expect(product).toBeVisible();
    await cabinet.screenshot({ path: "test-results/workday-packing-390.png", animations: "disabled" });
    await product.click();
    const sheet = cabinet.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: new RegExp(`^№${order.number} ·`) })).toBeVisible();
    await cabinet.screenshot({ path: "test-results/workday-packing-orders-390.png", animations: "disabled" });
    await sheet.getByRole("button", { name: new RegExp(`^№${order.number} ·`) }).click();
    await expect(cabinet.getByRole("heading", { name: `Заказ №${order.number}` })).toBeVisible();
    const sellerOrder = `/api/seller/orders/${order.number}`;
    const accepted = cabinet.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${sellerOrder}/transition` && response.request().method() === "POST",
    );
    await cabinet.getByRole("button", { name: "Принять", exact: true }).click();
    const acceptResponse = await accepted;
    expect(acceptResponse.ok()).toBe(true);
    let current: SellerOrder = await acceptResponse.json();
    expect(current.stage).toBe("accepted");
    await expect(cabinet.getByRole("button", { name: "Отметить все собранными" })).toBeVisible();
    await cabinet.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(cabinet).toHaveURL(/view=day/);
    await expect(product).toBeVisible();

    for (const step of [
      { action: "setAllPacked", packed: true },
      { action: "markReady" },
      { action: "confirmTransfer", proof: current.receipts[0].id, amountMinor: order.totalMinor },
      { action: "markPickedUp" },
    ]) {
      const response = await seller.request.post(`${sellerOrder}/transition?store=test2`, {
        data: { ...step, expectedRevision: current.revision },
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      expect(response.ok(), await response.text()).toBe(true);
      current = await response.json();
    }
    await storefront.goto(`/orders/${order.number}?shop=test2`);
    await expect(storefront.getByRole("heading", { name: "Выдан", exact: true })).toBeVisible();
    await test.step("O5 · задачи и журнал поступлений продавца", async () => {
      await cabinet.goto("/seller/money?store=test2", { waitUntil: "domcontentloaded" });
      await expect(cabinet.getByRole("heading", { name: "Задачи", exact: true })).toBeVisible();
      await expect(cabinet.getByRole("button", { name: /К получению сейчас|Ближайшая задача/u })).toHaveCount(0);
      await expect(cabinet.getByRole("button", { name: /Проверить чеки/u })).toBeVisible();
      await cabinet.screenshot({ path: "test-results/block11-seller-money-390.png", animations: "disabled" });
      await cabinet.getByRole("button", { name: "Операции", exact: true }).click();
      await expect(cabinet.getByRole("heading", { name: "Операции", exact: true })).toBeVisible();
      await expect(
        cabinet.getByRole("button", { name: new RegExp(`Поступление.*Заказ №${order.number}`, "u") }),
      ).toBeVisible();
      await cabinet.screenshot({ path: "test-results/block11-seller-operations-390.png", animations: "disabled" });
    });
    await test.step("Блок 9 · 07, §11.8: оформление без выбора времени при пустом горизонте", async () => {
      expect((await seller.request.post(fixture, { data: "empty" })).status()).toBe(204);
      await preparePickup(buyer.request);
      await storefront.goto("/checkout/receiving?shop=test2");
      await expect(storefront.getByText("Время уточнит магазин после заказа", { exact: true })).toBeVisible();
      await expect(storefront.getByRole("button", { name: /Выбрать время|Когда заберёте/ })).toHaveCount(0);
      await storefront.screenshot({ path: "test-results/workday-empty-horizon-390.png", animations: "disabled" });
      await storefront.getByRole("button", { name: /^К оплате/ }).click();
      await expect(storefront.getByRole("heading", { name: "Оплата", exact: true })).toBeVisible();
      await storefront.getByRole("radio", { name: "Наличные", exact: true }).check();
      const [created] = await Promise.all([
        storefront.waitForResponse(
          (response) => new URL(response.url()).pathname === "/api/checkout" && response.request().method() === "POST",
        ),
        storefront.getByRole("button", { name: /^Оформить заказ/ }).click(),
      ]);
      expect(created.status()).toBe(201);
      const withoutTime: OrderResult = await created.json();
      expect(withoutTime.time).toBeNull();
      await expect(storefront.getByRole("heading", { name: `Заказ №${withoutTime.number}` })).toBeVisible();
    });
  } finally {
    try {
      expect((await seller.request.post(fixture, { data: "restore" })).status()).toBe(204);
    } finally {
      await Promise.all([buyer.close(), seller.close()]);
    }
  }
  if (!baseURL) throw new Error("Нужен URL тестового магазина");
  await test.step("Блок 10 · изменение состава, доплата и выдача в одном заказе", () =>
    checkOrderChanges(browser, baseURL));
});

test("Блок 9 · регрессии рабочего дня и уведомлений", async ({ browser, baseURL }) => {
  test.setTimeout(85_000);
  await test.step("Блок 9 · 01: возврат из заказа сохраняет три загруженные страницы", () =>
    freshPage(browser, baseURL, checkOrderPagination));
  await test.step("Блок 9 · 02: Mini App показывает в шапках выбранный магазин", () =>
    freshPage(browser, baseURL, checkShopHeaders));
  await test.step("Блок 9 · 03: быстрый возврат и смена месяца укладываются в бюджет без 429", () =>
    freshPage(browser, baseURL, checkCalendarBudget));
  await test.step("Блок 9 · 05–06, 09 · §15.1: публичный адрес, отправка и ручное копирование", () =>
    freshPage(browser, baseURL, (page) => checkWorkdayShare(page, baseURL)));
  if (baseURL && new URL(baseURL).hostname === "demo.korzina.app")
    await test.step("Блок 9 · ближайшее время и пауза на demo", () => freshPage(browser, baseURL, checkDemoReceiving));
});

async function checkDemoReceiving(page: Page) {
  for (const shop of ["test2", "lavka"]) {
    const response = await page.request.get(`/api/receiving/next?shop=${shop}`);
    expect(response.ok()).toBe(true);
    const data: StorefrontReceiving = await response.json();
    expect(data.banners.length + data.methods.length).toBeGreaterThan(0);
    await page.goto(`/?shop=${shop}`);
    if (data.banners.length)
      await expect(page.getByRole("status").filter({ hasText: data.banners[0].text })).toBeVisible();
    if (data.methods.length)
      await expect(
        page
          .getByText(/Ближайшая доставка:|Самовывоз:|Время (доставки|самовывоза) согласуем|Время уточнит магазин/)
          .first(),
      ).toBeVisible();
  }
}
