import { type Browser, expect, test } from "@playwright/test";
import type { BuyerOrder } from "../src/shared/contracts/buyer-order";
import { orderLineKey } from "../src/shared/contracts/order-changes";
import type { AvailabilityDay } from "../src/shared/contracts/receiving-time";
import type { SellerOrder } from "../src/shared/contracts/seller-order";
import { formatReceivingTime } from "../src/shared/datetime";
import { formatMinor } from "../src/shared/money";
import { placePickup } from "./seller-orders";

export async function checkOrderChanges(browser: Browser, baseURL: string) {
  const options = { baseURL, viewport: { width: 390, height: 844 } };
  const [buyer, seller] = await Promise.all([
    browser.newContext({ ...options, extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.112" } }),
    browser.newContext({ ...options, extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.113" } }),
  ]);
  const origin = new URL(baseURL).origin;
  for (const context of [buyer, seller]) {
    await context.route(
      (url) => url.origin !== origin,
      async (route) => {
        const headers = await route.request().allHeaders();
        delete headers["cf-connecting-ip"];
        await route.continue({ headers });
      },
    );
  }
  const schedule = "/__e2e/test2/workday";
  try {
    expect((await buyer.request.get("/api/shop?shop=test2")).ok()).toBe(true);
    expect((await buyer.request.post("/__e2e/test2/buyer")).status()).toBe(204);
    expect((await seller.request.post("/__e2e/test2/seller")).status()).toBe(204);
    expect((await seller.request.post(schedule, { data: "setup" })).status()).toBe(204);
    const order = await placePickup(buyer.request, false);
    const storefront = await buyer.newPage();
    await storefront.addInitScript(() => localStorage.setItem("korzina:korzina-demo-test2:buyer", "1"));
    const cabinet = await seller.newPage();
    await Promise.all([
      storefront.goto(`/orders/${order.number}?shop=test2`),
      cabinet.goto(`/seller/orders/${order.number}?store=test2`),
    ]);
    const detail = `/api/seller/orders/${order.number}`;
    const status = async () => (await seller.request.get(`${detail}?store=test2`)).json() as Promise<SellerOrder>;
    const step = async (data: object) => {
      const previous = await status();
      const response = await seller.request.post(`${detail}/transition?store=test2`, {
        data: { ...data, expectedRevision: previous.revision },
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json() as Promise<SellerOrder>;
    };
    await test.step("Принять заказ и записать исходную оплату", async () => {
      const [accepted] = await Promise.all([
        cabinet.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === `${detail}/transition` &&
            response.request().method() === "POST" &&
            response.request().postDataJSON()?.action === "accept",
        ),
        cabinet.getByRole("button", { name: "Принять", exact: true }).click(),
      ]);
      expect(accepted.ok(), await accepted.text()).toBe(true);
      expect(await accepted.json()).toMatchObject({ stage: "accepted" });
      await expect(cabinet.getByRole("button", { name: "Отметить все собранными", exact: true })).toBeVisible();
      const paid = await step({ action: "recordPayment", method: "cash", amountMinor: order.totalMinor });
      expect(paid.balance.paidMinor).toBe(order.totalMinor);
    });

    const first = order.lines[0];
    const picks = (await (await seller.request.get(`${detail}/composition/pick?store=test2`)).json()) as {
      variantId: string;
      name: string;
      unit: string;
      priceMinor: number;
      stock: number | null;
    }[];
    const replacement = picks.find(
      (item) =>
        item.variantId !== first.variantId &&
        item.priceMinor > first.priceMinor &&
        (item.stock === null || item.stock >= first.quantity),
    );
    if (!replacement) throw new Error("Нужна доступная замена дороже исходной позиции");
    await cabinet.getByRole("button", { name: `Изменить ${first.name}`, exact: true }).click();
    await cabinet.getByRole("button", { name: "Заменить", exact: true }).click();
    await cabinet.getByRole("searchbox", { name: "Поиск по товарам магазина" }).fill(replacement.name);
    const option = cabinet
      .getByRole("dialog")
      .getByRole("button")
      .filter({ hasText: replacement.name })
      .filter({ hasText: replacement.unit })
      .first();
    await option.click();
    await test.step("#228 · 05: фасовка помнит количество после возврата к списку", async () => {
      await cabinet.getByRole("button", { name: "Уменьшить количество", exact: true }).click();
      await cabinet.getByRole("dialog").getByRole("button", { name: "Назад", exact: true }).click();
      await option.click();
      await expect(cabinet.getByLabel("Количество", { exact: true })).toHaveText(String(first.quantity - 1));
      await cabinet.screenshot({ path: "test-results/block10-replacement-quantity-390.png", animations: "disabled" });
      await cabinet.getByRole("button", { name: "Увеличить количество", exact: true }).click();
    });
    await cabinet.getByRole("button", { name: "Выбрать", exact: true }).click();
    await cabinet.getByRole("button", { name: "Сообщить покупателю (1)", exact: true }).click();
    const orderChange = storefront.getByRole("button", { name: /Магазин предлагает замену/ });
    await expect(orderChange).toBeVisible();
    await orderChange.click();
    await expect(storefront.getByRole("button", { name: "Согласен", exact: true })).toBeVisible();
    const images = storefront.locator("main [data-product-photo] img");
    await expect(images).toHaveCount(2);
    await expect
      .poll(async () =>
        images.evaluateAll(
          (photos) =>
            photos.length === 2 &&
            photos.every((photo) => photo instanceof HTMLImageElement && photo.complete && photo.naturalWidth > 0),
        ),
      )
      .toBe(true);
    await storefront.screenshot({ path: "test-results/block10-buyer-replacement-390.png", animations: "disabled" });
    await cabinet.screenshot({ path: "test-results/block10-seller-pending-390.png", animations: "disabled" });

    const current = await status();
    expect(current.totalMinor).toBe(order.totalMinor);
    const before = (await (await buyer.request.get(`/api/orders/${order.number}?shop=test2`)).json()) as BuyerOrder;
    expect(before.composition?.totals).toEqual(current.composition?.totals);
    await storefront.getByRole("button", { name: "Согласен", exact: true }).click();
    const topUp = (replacement.priceMinor - first.priceMinor) * first.quantity;
    await expect(
      storefront.getByRole("button", { name: `Доплатить ${formatMinor(topUp, order.currency)}`, exact: true }),
    ).toBeVisible();
    await expect(
      cabinet.getByText(`Покупатель доплатит ${formatMinor(topUp, order.currency)}`, { exact: true }),
    ).toBeVisible();

    await storefront.getByRole("button", { name: "К заказу", exact: true }).click();
    const availability = (await (await seller.request.get(`${detail}/time?store=test2`)).json()) as {
      timeZone: string;
      days: AvailabilityDay[];
    };
    const nextDay = availability.days.find(({ date, available }) => date !== order.time?.date && available);
    const nextSlot = nextDay?.intervals.find(({ available }) => available);
    if (!nextDay || !nextSlot) throw new Error("Нужно свободное окно для переноса");
    const nextTime = { date: nextDay.date, slotId: nextSlot.id };
    await cabinet.getByRole("button", { name: "Изменить время", exact: true }).click();
    await cabinet
      .getByRole("radio", { name: formatReceivingTime(nextTime, availability.timeZone), exact: true })
      .check();
    await cabinet.getByRole("button", { name: "Предложить время", exact: true }).click();
    await expect(storefront.getByText("Магазин предлагает другое время", { exact: true })).toBeVisible();
    await storefront.screenshot({ path: "test-results/block10-buyer-time-390.png", animations: "disabled" });
    await storefront.getByRole("button", { name: "Подходит", exact: true }).click();
    await expect.poll(async () => (await status()).time).toEqual(nextTime);
    await storefront.getByRole("button", { name: "Чат с магазином", exact: true }).click();
    await cabinet.getByRole("button", { name: "Чат по заказу", exact: true }).click();
    await expect(cabinet.getByText("Получен ответ по замене", { exact: true })).toBeVisible();
    const chat = `/api/orders/chat/${order.number}?shop=test2`;
    const command = crypto.randomUUID();
    const data = { text: "Подойду к открытию" };
    const send = () => buyer.request.post(chat, { data, headers: { "Idempotency-Key": command } });
    const firstMessage = await send();
    expect(firstMessage.ok(), await firstMessage.text()).toBe(true);
    expect(await (await send()).json()).toEqual(await firstMessage.json());
    const received = cabinet.getByText(data.text, { exact: true });
    await expect(received).toHaveCount(1);
    await received.scrollIntoViewIfNeeded();
    await expect(received).toBeInViewport();
    await cabinet.screenshot({ path: "test-results/block10-seller-chat-390.png", animations: "disabled" });

    await step({ action: "recordPayment", method: "cash", amountMinor: topUp });
    await step({ action: "setAllPacked", packed: true });
    await step({ action: "markReady" });
    const completed = await step({ action: "markPickedUp" });
    expect(completed).toMatchObject({ stage: "completed", balance: { outstandingMinor: 0, debtMinor: 0 } });
    await storefront.getByRole("button", { name: `Открыть заказ №${order.number}`, exact: true }).click();
    await expect(storefront.getByRole("heading", { name: "Выдан", exact: true })).toBeVisible();

    await test.step("#228 · 03а, §13.2: «Не нужно» обновляет строку продавца без перезагрузки", async () => {
      const declined = await placePickup(buyer.request, false);
      const path = `/api/seller/orders/${declined.number}`;
      const details = await seller.request.get(`${path}?store=test2`);
      expect(details.ok(), await details.text()).toBe(true);
      const { revision, lines }: SellerOrder = await details.json();
      const edit = {
        expectedVersion: revision,
        edits: [{ kind: "replace", lineId: orderLineKey(lines[0]), variantId: replacement.variantId, quantity: 1 }],
      };
      const quote = await seller.request.post(`${path}/composition/quote?store=test2`, { data: edit });
      expect(quote.ok(), await quote.text()).toBe(true);
      const proposal = await seller.request.post(`${path}/composition?store=test2`, {
        data: { ...edit, quote: (await quote.json()).quote },
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      expect(proposal.ok(), await proposal.text()).toBe(true);
      await Promise.all([
        storefront.goto(`/orders/${declined.number}/changes?shop=test2`),
        cabinet.goto(`/seller/orders/${declined.number}?store=test2`),
      ]);
      await expect(cabinet.getByRole("status").filter({ hasText: /ждём ответа/iu })).toBeVisible();
      await storefront.getByRole("button", { name: "Не нужно", exact: true }).click();
      const refusal = cabinet.getByRole("status").filter({ hasText: "Отказался" });
      await expect(refusal).toBeVisible();
      await expect(cabinet.getByRole("status").filter({ hasText: /ждём ответа/iu })).toHaveCount(0);
      await cabinet.screenshot({ path: "test-results/block10-seller-declined-390.png", animations: "disabled" });
    });
  } finally {
    await seller.request.post(schedule, { data: "restore" });
    await Promise.all([buyer.close(), seller.close()]);
  }
}
