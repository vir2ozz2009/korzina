import { expect, test } from "@playwright/test";
import type { SellerOrder, SellerOrderSummary } from "../src/shared/contracts/seller-order";

import { cabinetFixture, day } from "./workday-fixture";
import { checkWorkdayShare } from "./workday-share";

const orderUrl = /\/api\/seller\/orders(?:\?|$)/;
const emptyPage = { rev: 7, timeZone: "UTC", active: 0, newlyPlaced: 0, counts: {}, orders: [] };

const summary: Omit<SellerOrderSummary, "number"> = {
  stage: "placed",
  revision: 0,
  method: "pickup",
  receivingAt: `${day}T12:00`,
  createdAt: 0,
  name: "Тестовый покупатель",
  currency: "VND",
  totalMinor: 49000,
  paymentStatus: "unpaid",
  packed: 0,
  lines: 0,
  debtMinor: 17000,
  refundMinor: 0,
};

test("Блок 9 · 01: возврат из заказа сохраняет три загруженные страницы", async ({ page }) => {
  await cabinetFixture(page);
  const requested: { cursor: number; day: string | null }[] = [];
  await page.route(orderUrl, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const cursor = Number(params.get("cursor"));
    requested.push({ cursor, day: params.get("day") });
    const orders = Array.from({ length: 20 }, (_, i) => ({ ...summary, number: 20 * cursor + i + 1 }));
    return route.fulfill({
      json: {
        ...emptyPage,
        orders,
        active: 60,
        counts: { placed: 60 },
        cursor: cursor < 2 ? String(cursor + 1) : undefined,
      },
    });
  });
  const detail: SellerOrder = {
    number: 54,
    stage: "placed",
    revision: 0,
    currency: "VND",
    createdAt: 0,
    timeZone: "UTC",
    itemsMinor: 0,
    deliveryMinor: 0,
    totalMinor: 0,
    receiving: { mode: "pickup" },
    fulfillment: { mode: "pickup", available: true, pickup: { address: "Учебный адрес", hours: "" } },
    time: null,
    phone: null,
    telegramLinked: false,
    payment: "cash",
    paymentStatus: "unpaid",
    lines: [],
    packed: [],
    events: [],
    receipts: [],
    handedOff: false,
    readyForPickup: false,
    deliveryAssigned: false,
    balance: { paidMinor: 0, outstandingMinor: 0, debtMinor: 0, refundMinor: 0 },
    permissions: { assembly: true, payments: false },
  };
  await page.route(/\/api\/seller\/orders\/54\?/, (route) => route.fulfill({ json: detail }));
  await page.goto(`/seller/orders?store=test2&day=${day}`);
  const more = page.getByRole("button", { name: "Показать ещё" });
  const cards = page.getByRole("button", { name: /^Открыть заказ №/ });
  await expect(cards).toHaveCount(20);
  await test.step("Блок 9 · 08, §11.3: в карточках списка сборщика нет сумм", async () => {
    await expect(page.getByText(/₫|Долг клиента/)).toHaveCount(0);
  });
  await more.click();
  await expect(cards).toHaveCount(40);
  await more.click();
  await expect(cards).toHaveCount(60);
  const beforeOpen = requested.length;
  const order = page.getByRole("button", { name: "Открыть заказ №54", exact: true });
  await order.click();
  await expect(page.getByText("Клиент видит №54")).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/seller/orders.*day=${day}`));
  await expect(cards).toHaveCount(60);
  await expect(order).toBeInViewport();
  expect(requested).toHaveLength(beforeOpen);
  expect(requested.filter(({ cursor }) => cursor > 0).map(({ cursor }) => cursor)).toEqual([1, 2]);
  expect(requested.every((request) => request.day === day)).toBe(true);
});

test("Блок 9 · 02: Mini App показывает в шапках выбранный магазин", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Telegram", { value: { WebApp: {} } });
  });
  await cabinetFixture(page);
  await page.route(orderUrl, (route) => route.fulfill({ json: emptyPage }));
  await page.route(/\/api\/seller\/orders\/packing\?/, (route) =>
    route.fulfill({ json: { rev: 7, day, today: day, hasTimes: false, windows: [] } }),
  );
  await page.route(/\/api\/seller\/team\/notifications\?/, (route) =>
    route.fulfill({ json: { rows: [], recipients: [] } }),
  );
  const tabs = page.getByRole("navigation", { name: "Кабинет продавца" });
  const logo = (name: string) => page.locator("header").getByRole("img", { name, exact: true });
  await page.goto("/seller?shop=test2&store=workday-draft");
  await tabs.getByRole("button", { name: "Заказы", exact: true }).click();
  await expect(logo("Черновик магазина")).toBeVisible();
  await tabs.getByRole("button", { name: "Главная" }).click();
  await page.getByRole("button", { name: "Выбрать магазин" }).click();
  await page.getByRole("button", { name: /Первый магазин/ }).click();
  await tabs.getByRole("button", { name: "Заказы", exact: true }).click();
  await expect(logo("Первый магазин")).toBeVisible();
  await expect(logo("Черновик магазина")).toHaveCount(0);
  await tabs.getByRole("button", { name: "Главная" }).click();
  await page.getByRole("button", { name: "Список сборки", exact: true }).click();
  await expect(logo("Первый магазин")).toBeVisible();
  await tabs.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("button", { name: "Уведомления", exact: true }).click();
  await expect(page.getByRole("table", { name: "Уведомления по ролям" })).toBeVisible();
  await expect(logo("Первый магазин")).toBeVisible();
});

test("Блок 9 · 03: быстрый возврат и смена месяца укладываются в бюджет без 429", async ({ page }) => {
  const live = await cabinetFixture(page);
  const statuses: number[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/seller/")) statuses.push(response.status());
  });
  let lists = 0;
  await page.route(orderUrl, (route) => {
    lists++;
    return route.fulfill({ json: emptyPage });
  });
  const months: (string | null)[] = [];
  let finishDecember = () => {};
  const december = new Promise<void>((resolve) => {
    finishDecember = resolve;
  });
  await page.route(/\/api\/seller\/orders\/calendar\?/, async (route) => {
    const month = new URL(route.request().url()).searchParams.get("month");
    months.push(month);
    if (months.length > 2) return route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED" } } });
    if (month === "2099-12") await december;
    await route.fulfill({ json: { rev: 7, month, today: day, counts: { [`${month}-22`]: 0 } } });
  });
  try {
    await page.goto(`/seller/orders?store=test2&day=${day}`);
    const calendar = page.getByRole("button", { name: "Календарь", exact: true });
    const next = page.getByRole("button", { name: "Следующий месяц" });
    const previous = page.getByRole("button", { name: "Предыдущий месяц" });
    await expect.poll(() => live.sockets).toBe(1);
    await expect(calendar).toBeVisible();
    const firstListRequests = lists;
    await calendar.click();
    await next.click();
    await expect.poll(() => months).toEqual(["2099-11", "2099-12"]);
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await calendar.click();
    await next.click();
    finishDecember();
    await expect(page.getByRole("button", { name: /^22 декабря,/ })).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await previous.click();
      await expect(page.getByRole("button", { name: /^22 ноября,/ })).toBeVisible();
      await next.click();
      await expect(page.getByRole("button", { name: /^22 декабря,/ })).toBeVisible();
    }
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(calendar).toBeVisible();
    expect(months).toEqual(["2099-11", "2099-12"]);
    expect(lists).toBe(firstListRequests);
    expect(live).toEqual({ tickets: 1, sockets: 1 });
    expect(statuses).not.toContain(429);
  } finally {
    finishDecember();
  }
});

test("Блок 9 · 05–06, §15.1: публичный адрес, отправка и ручное копирование", async ({ page, baseURL }) => {
  await checkWorkdayShare(page, baseURL);
});
