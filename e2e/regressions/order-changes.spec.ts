import { expect, type Page } from "@playwright/test";
import type { BuyerOrder } from "../../src/shared/contracts/buyer-order";
import { orderLineKey } from "../../src/shared/contracts/order-changes";
import { formatMinor } from "../../src/shared/money";
import {
  anywhere,
  cabinet,
  command,
  configure,
  hours,
  json,
  orderDetail,
  placeOrder,
  restoreCucumber,
  resume,
  storefront,
  test,
  transition,
} from "./fixture";

const tag = { tag: "@regression" };
const telegramViewport = { height: 680, bottom: 0 };

test.beforeEach(async ({ seller }) => {
  await configure(seller.request, { delivery: anywhere, requiredDetails: [], minimumMinor: 120000 });
  await resume(seller.request);
  await hours(seller.request, "after_order");
});

test.afterEach(async ({ seller }) => {
  await hours(seller.request, "2");
});

async function openOrder(buyer: Page, seller: Page, number: number) {
  await seller.addInitScript(({ height, bottom }) => {
    const noop = () => {};
    window.Telegram = {
      WebApp: {
        initData: "",
        viewportHeight: height,
        viewportStableHeight: 844,
        platform: "ios",
        isExpanded: false,
        colorScheme: "light",
        safeAreaInset: { top: 0, bottom, left: 0, right: 0 },
        BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
        ready: noop,
        expand: noop,
        setHeaderColor: noop,
        setBackgroundColor: noop,
        onEvent: noop,
        offEvent: noop,
      },
    };
  }, telegramViewport);
  await Promise.all([
    buyer.goto(`/orders/${number}?${storefront}`),
    seller.goto(`/seller/orders/${number}?${cabinet}&telegram=1`),
  ]);
}

for (const answer of ["Согласен", "Не нужно"] as const) {
  test(
    `§17.1 блок 10 отсутствие товара и ответ «${answer}» одинаково видны покупателю и продавцу`,
    tag,
    async ({ page, seller, rememberOrder }) => {
      await restoreCucumber(seller.request);
      const order = await placeOrder(page, "pickup", "sku-25");
      rememberOrder(order.number);
      await transition(seller.request, order.number, { action: "accept" });
      await openOrder(page, seller, order.number);
      const removed = order.lines.find((line) => line.variantId === "sku-25");
      if (!removed) throw new Error("Нужна вторая позиция заказа");
      await seller.getByRole("button", { name: `Изменить ${removed.name}`, exact: true }).click();
      await seller.getByRole("button", { name: "Нет в наличии", exact: true }).click();
      await seller.getByRole("dialog").getByRole("button", { name: "Отметить", exact: true }).click();
      const kept = order.lines.find((line) => line !== removed);
      if (!kept) throw new Error("Нужна позиция для замены");
      const choices = await json<
        { variantId: string; name: string; unit: string; priceMinor: number; stock: number | null }[]
      >(await seller.request.get(`/api/seller/orders/${order.number}/composition/pick?${cabinet}`));
      const replacement = choices.find(
        (choice) =>
          choice.name !== kept.name &&
          choice.name !== removed.name &&
          (choice.stock === null || choice.stock >= kept.quantity),
      );
      if (!replacement) throw new Error("Нужна доступная замена");
      await seller.getByRole("button", { name: `Изменить ${kept.name}`, exact: true }).click();
      const replace = seller.getByRole("button", { name: "Заменить", exact: true });
      await expect
        .poll(() => replace.evaluate((button) => button.getBoundingClientRect().bottom))
        .toBeLessThanOrEqual(telegramViewport.height - 34);
      await replace.click();
      const picker = seller.getByRole("dialog", { name: "Выберите замену" });
      await picker.getByRole("searchbox").fill(replacement.name);
      await picker
        .getByRole("button")
        .filter({ hasText: replacement.name })
        .filter({ hasText: replacement.unit })
        .first()
        .click();
      await seller.getByRole("button", { name: "Выбрать", exact: true }).click();
      await seller.getByRole("button", { name: "Сообщить покупателю (2)", exact: true }).click();
      await page.getByRole("button", { name: /Магазин предлагает/ }).click();
      await expect(page.getByText(/Нет в наличии/).first()).toBeVisible();
      await page.getByRole("button", { name: answer, exact: true }).click();
      const withoutRemoved = order.totalMinor - removed.priceMinor * removed.quantity;
      await expect
        .poll(async () => (await orderDetail(seller.request, order.number)).totalMinor)
        .toBe(answer === "Согласен" ? withoutRemoved + (replacement.priceMinor - kept.priceMinor) * kept.quantity : 0);
      const current = await orderDetail(seller.request, order.number);
      const buyer = await json<BuyerOrder>(await page.request.get(`/api/orders/${order.number}?${storefront}`));
      expect(buyer.composition?.totals).toEqual(current.composition?.totals);
      expect(buyer.totalMinor).toBe(current.totalMinor);
      if (answer === "Не нужно")
        await expect(seller.getByRole("status").filter({ hasText: "Отказался" })).toBeVisible();
      else await expect(seller.getByText(/Нет в наличии — убрали/)).toBeVisible();
    },
  );
}

test("§17.2 блок 10 Доплатить открывает выбор способа оплаты", tag, async ({ page, seller, rememberOrder }) => {
  const order = await placeOrder(page);
  rememberOrder(order.number);
  await transition(seller.request, order.number, { action: "accept" });
  const paid = await transition(seller.request, order.number, {
    action: "recordPayment",
    method: "cash",
    amountMinor: order.totalMinor,
  });
  const path = `/api/seller/orders/${order.number}/composition`;
  const line = paid.lines[0];
  const choices = await json<{ variantId: string; priceMinor: number; stock: number | null }[]>(
    await seller.request.get(`${path}/pick?${cabinet}`),
  );
  const replacement =
    choices.find((choice) => choice.priceMinor > line.priceMinor && choice.stock === null) ??
    choices.find((choice) => choice.priceMinor > line.priceMinor && (choice.stock ?? 0) >= line.quantity);
  if (!replacement) throw new Error("Нужна доступная фасовка дороже исходной");
  const data = {
    expectedVersion: paid.revision,
    edits: [{ kind: "replace", lineId: orderLineKey(line), variantId: replacement.variantId, quantity: line.quantity }],
  };
  const { quote } = await json<{ quote: string }>(await seller.request.post(`${path}/quote?${cabinet}`, { data }));
  await json(await seller.request.post(`${path}?${cabinet}`, { data: { ...data, quote }, headers: command() }));
  await page.goto(`/orders/${order.number}/changes?${storefront}`);
  await page.getByRole("button", { name: "Согласен", exact: true }).click();
  const difference = (replacement.priceMinor - line.priceMinor) * line.quantity;
  await page.getByRole("button", { name: `Доплатить ${formatMinor(difference, order.currency)}`, exact: true }).click();
  await expect(page.getByRole("dialog", { name: /способ оплаты|доплат/i })).toBeVisible();
  await expect(page.getByText(/Наличными|Наличные/).first()).toBeVisible();
  await expect(page.getByText("Перевод", { exact: true }).first()).toBeVisible();
});

test(
  "#235 / §17.3 блок 10 перенос на целый день показывает «В течение дня»",
  tag,
  async ({ page, seller, rememberOrder }) => {
    const order = await placeOrder(page);
    rememberOrder(order.number);
    await transition(seller.request, order.number, { action: "accept" });
    await hours(seller.request, "day");
    await seller.goto(`/seller/orders/${order.number}?${cabinet}`);
    await seller.getByRole("button", { name: "Изменить время", exact: true }).click();
    const fullDay = seller.getByRole("radio", { name: /В течение дня/ }).first();
    await expect(fullDay).toBeVisible();
    await fullDay.check();
    const sent = seller.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith(`/${order.number}/time`) && response.request().method() === "POST",
    );
    await seller.getByRole("button", { name: "Сохранить время" }).click();
    const response = await sent;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON().time).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  },
);

test(
  "§17.4 блок 10 сообщение продавца сохраняется в чате того же заказа",
  tag,
  async ({ page, seller, rememberOrder }) => {
    const order = await placeOrder(page);
    rememberOrder(order.number);
    await transition(seller.request, order.number, { action: "accept" });
    await seller.goto(`/seller/orders/${order.number}?${cabinet}`);
    await seller.getByRole("button", { name: "Чат по заказу", exact: true }).click();
    await expect(seller).toHaveURL(new RegExp(`/seller/orders/${order.number}/chat\\?`));
    const message = "QA1 · Заказ будет готов к открытию";
    await seller.getByRole("textbox").fill(message);
    await seller.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(seller.getByText(message, { exact: true })).toBeVisible();
    await seller.reload();
    await expect(seller.getByText(message, { exact: true })).toBeVisible();
  },
);
