import { expect, type Page } from "@playwright/test";
import type { SellerMoneyOperation, SellerMoneyPage } from "../../src/shared/contracts/seller-money";
import { formatMinor, minorInput } from "../../src/shared/money";
import { anywhere, cabinet, configure, hours, json, placeOrder, resume, test, transition } from "./fixture";

const operations = "/api/seller/money/operations";
const searchLabel = "Номер заказа или точная сумма";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function prepareOrder(page: Page, seller: Page, rememberOrder: (number: number) => void) {
  if (!process.env.E2E_BASE_URL) {
    await configure(seller.request, { delivery: anywhere, requiredDetails: [], minimumMinor: 120000 });
    await resume(seller.request);
  }
  // The fixture does not select a pickup slot. Demo normally requires one.
  await hours(seller.request, "after_order");
  try {
    const order = await placeOrder(page);
    rememberOrder(order.number);
    return await transition(seller.request, order.number, { action: "accept" });
  } finally {
    await hours(seller.request, "2");
  }
}

test("Блок 11 · сценарий 10 повторяет потерянную оплату, но отдельно записывает новую на ту же сумму", {
  tag: "@regression",
}, async ({ page, seller, rememberOrder }) => {
  const order = await prepareOrder(page, seller, rememberOrder);
  const number = order.number;
  const amountMinor = Math.floor(order.totalMinor / 2);
  const posts: { key: string | undefined; body: string | null }[] = [];
  const socket = seller.waitForEvent("websocket", { predicate: (ws) => ws.url().includes("/api/seller/orders/live?") });
  let committed: number | undefined;
  await seller.route(
    (url) => url.pathname === `/api/seller/orders/${number}/transition`,
    async (route) => {
      const request = route.request();
      posts.push({ key: request.headers()["idempotency-key"], body: request.postData() });
      if (posts.length !== 1) return route.continue();
      const response = await route.fetch();
      committed = response.status();
      await route.abort("failed");
    },
  );
  await seller.goto(`/seller/orders/${number}?${cabinet}`);
  const write = seller.getByRole("button", { name: "Записать оплату", exact: true });
  const sheet = seller.getByRole("dialog", { name: "Записать оплату", exact: true });
  const submit = sheet.getByRole("button", { name: "Записать оплату", exact: true });
  const amount = sheet.getByRole("textbox", { name: "Сумма", exact: true });
  const amountText = formatMinor(amountMinor, order.currency);
  const input = minorInput(amountMinor, order.currency);
  async function openPayment() {
    await write.click();
    await sheet.getByRole("button", { name: "Наличными", exact: true }).click();
    await amount.fill(input);
  }
  const journal = () =>
    seller.request
      .get(`${operations}?${cabinet}&search=${number}`)
      .then(json<SellerMoneyPage<SellerMoneyOperation>>)
      .then(({ rows }) => rows.filter((row) => row.number === number && row.kind === "received"));

  await socket;
  await openPayment();
  await submit.click();
  await expect(sheet.getByRole("alert")).toBeVisible();
  expect(committed).toBe(200);
  // The real orders event has updated this view's revision while the failed form stays open.
  await expect(seller.getByText(`Наличными · Получено ${amountText}`, { exact: true })).toBeVisible();
  await expect(amount).toHaveValue(input);
  expect((await journal()).map((row) => row.amountMinor)).toEqual([amountMinor]);

  await submit.click();
  await expect(sheet).toBeHidden();
  expect(posts).toHaveLength(2);
  expect(posts[0]?.key).toBeTruthy();
  expect(posts[1]).toEqual(posts[0]);
  expect((await journal()).map((row) => row.amountMinor)).toEqual([amountMinor]);

  await openPayment();
  await submit.click();
  await expect(sheet).toBeHidden();
  expect(posts).toHaveLength(3);
  expect(posts[2]?.key).toBeTruthy();
  expect(posts[2]?.key).not.toBe(posts[0]?.key);
  const rows = await journal();
  expect(rows.map((row) => row.amountMinor)).toEqual([amountMinor, amountMinor]);
  expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  await seller.goto(`/seller/money/operations?${cabinet}&q=${number}`);
  await expect(seller.getByRole("button", { name: new RegExp(`Поступление Заказ №${number} ·`) })).toHaveCount(2);
});

test("Блок 11 · сценарий 23 при отзыве payments действующая сессия не показывает запоздавшие строки", {
  tag: "@regression",
}, async ({ page, seller, rememberOrder }) => {
  const order = await prepareOrder(page, seller, rememberOrder);
  await transition(seller.request, order.number, {
    action: "recordPayment",
    method: "cash",
    amountMinor: order.totalMinor,
  });
  await seller.goto(`/seller/money/operations?${cabinet}`);
  const row = seller.getByRole("button", { name: new RegExp(`Поступление Заказ №${order.number} ·`) });
  await expect(row).toBeVisible();
  const held = deferred<SellerMoneyPage<SellerMoneyOperation>>();
  const release = deferred<void>();
  const delivered = deferred<void>();
  const deniedSearch = `№${order.number}`;
  // Exercise the browser race on demo without editing its membership. The server test revokes real payments.
  await seller.route(
    (url) => url.pathname === operations,
    async (route) => {
      const search = new URL(route.request().url()).searchParams.get("search");
      if (search === deniedSearch)
        return route.fulfill({ status: 403, json: { error: { code: "FORBIDDEN", message: "Недостаточно прав" } } });
      if (search !== String(order.number)) return route.continue();
      const response = await route.fetch();
      held.resolve(await json<SellerMoneyPage<SellerMoneyOperation>>(response));
      await release.promise;
      await route.fulfill({ response });
      delivered.resolve();
    },
  );
  try {
    const search = seller.getByRole("textbox", { name: searchLabel });
    await search.fill(String(order.number));
    expect((await held.promise).rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ number: order.number })]),
    );
    await search.fill(deniedSearch);
    const restricted = seller.getByRole("heading", { name: "Доступ ограничен", exact: true });
    await expect(restricted).toBeVisible();
    await expect(row).toHaveCount(0);
    release.resolve();
    await delivered.promise;
    await expect(restricted).toBeVisible();
    await expect(seller.getByRole("button", { name: /^(Поступление|Возврат) Заказ/ })).toHaveCount(0);
    await expect(seller.getByRole("button", { name: "Войти", exact: true })).toHaveCount(0);
    expect((await seller.request.get(`/api/seller/cabinet?${cabinet}`)).status()).toBe(200);
  } finally {
    release.resolve();
  }
});
