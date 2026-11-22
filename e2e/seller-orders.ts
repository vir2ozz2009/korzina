import { type APIRequestContext, type Browser, expect, test } from "@playwright/test";
import type { OrderResult, QuoteResponse } from "../src/shared/contracts/checkout";
import type { AvailabilityDay } from "../src/shared/contracts/receiving-time";
import type { SellerOrder } from "../src/shared/contracts/seller-order";

function pdfReceipt() {
  const stream = "BT /F1 18 Tf 28 142 Td (Korzina test receipt) Tj 0 -27 Td (Payment received) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 280 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let file = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = file.length;
    file += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return String(offset).padStart(10, "0");
  });
  const start = file.length;
  file += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${offset} 00000 n \n`).join("")}`;
  return Buffer.from(`${file}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}

export async function placePickup(request: APIRequestContext, transfer: boolean) {
  const read = async <T>(path: string): Promise<T> => {
    const response = await request.get(`${path}${path.includes("?") ? "&" : "?"}shop=test2`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const write = async <T>(path: string, data: object | Buffer, contentType = "application/json"): Promise<T> => {
    const response = await request.post(`${path}${path.includes("?") ? "&" : "?"}shop=test2`, {
      data,
      headers: { "Idempotency-Key": crypto.randomUUID(), "Content-Type": contentType },
    });
    expect(response.ok(), `HTTP ${response.status()} ${path}: ${await response.text()}`).toBe(true);
    return response.json();
  };
  await write("/api/auth/contact", { phone: "+84912345678", confirmed: true });
  const cart = await read<{ revision: number }>("/api/cart");
  const changed = await write<{ revision: number }>("/api/cart", {
    action: "set",
    variantId: "sku-20",
    quantity: 3,
    expectedRevision: cart.revision,
  });
  const receiving = await write<{ revision: number }>("/api/receiving", {
    receiving: { mode: "pickup" },
    expectedRevision: changed.revision,
    complete: true,
  });
  const availability = await read<{ mode: string; days: AvailabilityDay[] }>(
    "/api/receiving/availability?method=pickup",
  );
  if (availability.mode !== "after_order") {
    const day = availability.days.find((item) => item.available);
    expect(day).toBeDefined();
    const slot = day?.intervals.find((item) => item.available);
    await write("/api/receiving/time", {
      expectedRevision: receiving.revision,
      time: { date: day?.date, ...(slot && { slotId: slot.id }) },
    });
  }
  const { quoteRevision } = await write<QuoteResponse>("/api/quote", {});
  if (!transfer) return write<OrderResult>("/api/checkout", { quoteRevision, payment: "cash" });
  const document = await write<{ id: string }>("/api/media/upload?purpose=receipt", pdfReceipt(), "application/pdf");
  await write("/api/checkout/receipt", { quoteRevision, proofMediaId: document.id });
  return write<OrderResult>("/api/checkout", { quoteRevision, payment: "transfer", proofMediaId: document.id });
}

export async function verifySellerOrders(browser: Browser, baseURL: string) {
  const viewport = { width: 390, height: 844 };
  const timezoneId = "America/Los_Angeles";
  const [buyer, seller] = await Promise.all([
    browser.newContext({ baseURL, viewport, timezoneId, extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.81" } }),
    browser.newContext({ baseURL, viewport, timezoneId, extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.82" } }),
  ]);
  try {
    const page = await buyer.newPage();
    expect((await seller.request.post("/__e2e/test2/seller")).status()).toBe(204);
    const cabinet = await seller.newPage();
    const live = cabinet.waitForEvent("websocket", {
      predicate: (socket) => socket.url().includes("/seller/orders/live"),
    });
    await cabinet.goto("/seller/orders?store=test2&shop=test2");
    await expect(cabinet.getByRole("heading", { name: "Заказы", exact: true })).toBeVisible();
    await expect(cabinet.getByRole("button", { name: /В работе/ })).toBeVisible();
    const connection = await live;
    const signal = connection.waitForEvent("framereceived", {
      predicate: ({ payload }) => typeof payload === "string" && payload.includes('"id"'),
    });
    const order = await placePickup(page.request, true);
    await signal;
    await cabinet.getByRole("searchbox", { name: "Номер, имя или телефон" }).fill(`№${order.number}`);
    const orderButton = cabinet.getByRole("button", { name: `Открыть заказ №${order.number}`, exact: true });
    const orderCard = orderButton.locator("..");
    await expect(orderButton).toBeVisible();
    await cabinet.screenshot({ path: "test-results/seller-orders-390.png", animations: "disabled" });
    await orderCard.getByRole("button", { name: "Принять", exact: true }).click();
    const slot = order.time?.slotId;
    if (!order.time || !slot) throw new Error("Demo pickup must have a scheduled interval");
    // Just after midnight in the shop. The browser in Los Angeles is still on the previous day.
    const now = Date.parse(`${order.time.date}T00:30:00+07:00`);
    const telegram = await seller.request.post(`/__e2e/test2/order-message?number=${order.number}&now=${now}`);
    expect(telegram.ok()).toBe(true);
    const [day, start] = (await telegram.text()).split("\n")[1].split(" · ");
    expect(day).toMatch(/^Сегодня, /);
    const [startAt, endAt] = slot.split("-");
    expect(start).toBe(startAt);
    const receiving = `${day} · ${start}–${endAt}`;
    await cabinet.clock.setFixedTime(now);
    await orderCard.getByRole("button", { name: "Открыть сборку" }).click();
    await expect(cabinet.getByText(receiving, { exact: true })).toBeVisible();
    await cabinet.clock.setFixedTime(Date.now());
    await cabinet.getByRole("button", { name: "Отметить все собранными" }).click();
    await expect(cabinet.getByText("Собрано 1 из 1")).toBeVisible();
    await cabinet.getByRole("button", { name: "Сборка завершена" }).click();
    await cabinet.getByRole("button", { name: "Проверить перевод" }).click();
    const detailsResponse = await seller.request.get(`/api/seller/orders/${order.number}?store=test2`);
    expect(detailsResponse.ok()).toBe(true);
    const details: SellerOrder = await detailsResponse.json();
    expect(details.timeZone).toBe("Asia/Ho_Chi_Minh");
    const receiptDate = new Intl.DateTimeFormat("ru-RU", {
      timeZone: details.timeZone,
      dateStyle: "short",
      timeStyle: "short",
    }).format(details.receipts[0].createdAt);
    const latestReceipt = cabinet.getByRole("button", { name: "Последний чек" });
    await expect(latestReceipt).toContainText(receiptDate);
    await latestReceipt.click();
    const receipt = cabinet.getByLabel("Документ чека");
    await expect(receipt).toHaveAttribute("data", /^blob:/);
    const bytes = await receipt.evaluate(async (element) =>
      Array.from(new Uint8Array(await (await fetch((element as HTMLObjectElement).data)).arrayBuffer())),
    );
    expect(Buffer.from(bytes)).toEqual(pdfReceipt());
    await cabinet.screenshot({ path: "test-results/seller-receipt-390.png", animations: "disabled" });
    await cabinet.getByRole("button", { name: "Назад", exact: true }).last().click();
    await cabinet.getByRole("button", { name: "Деньги пришли" }).click();
    await cabinet.getByRole("button", { name: "Подтвердить поступление" }).click();
    await cabinet.getByRole("button", { name: "Исправить оплату" }).click();
    await cabinet.getByRole("button", { name: "Наличными", exact: true }).click();
    await cabinet.getByRole("button", { name: "Проверить изменения" }).click();
    await cabinet.getByRole("button", { name: "Подтвердить исправление" }).click();
    await cabinet.getByText("История заказа", { exact: true }).click();
    const history = cabinet.locator("li").filter({ hasText: "Оплата исправлена" });
    await expect(history.locator("time")).toBeVisible();
    await cabinet.screenshot({ path: "test-results/seller-history-390.png", animations: "disabled" });
    await cabinet.getByRole("button", { name: "Выдать заказ", exact: true }).click();
    await cabinet.getByRole("button", { name: "Подтвердить", exact: true }).click();
    await page.clock.setFixedTime(now);
    await page.goto(`/orders/${order.number}?shop=test2`);
    await expect(page.getByRole("heading", { name: "Выдан", exact: true })).toBeVisible();
    await expect(page.getByText(receiving, { exact: false })).toBeVisible();
    await page.clock.setFixedTime(Date.now());
    const debt = await placePickup(page.request, false);
    await cabinet.goto(`/seller/orders/${debt.number}?store=test2&shop=test2`);
    await cabinet.getByRole("button", { name: "Принять", exact: true }).click();
    await cabinet.getByRole("button", { name: "Отметить все собранными" }).click();
    await expect(cabinet.getByText("Собрано 1 из 1")).toBeVisible();
    await cabinet.getByRole("button", { name: "Сборка завершена" }).click();
    await cabinet.getByRole("button", { name: "Выдать заказ", exact: true }).click();
    await expect(cabinet.getByRole("dialog", { name: /^Заказ не оплачен/ })).toBeVisible();
    await cabinet.screenshot({ path: "test-results/seller-payment-choice-390.png", animations: "disabled" });
    await cabinet.getByRole("button", { name: "Не заплатил — записать долг" }).click();
    await expect(cabinet.getByText(/Долг клиента/)).toBeVisible();
    // The API-created fixture has a real buyer cookie. Initialize the same storefront marker as the contact UI.
    await page.evaluate(() => localStorage.setItem("korzina:korzina-demo-test2:buyer", "1"));
    await page.goto("/?shop=test2");
    await expect(page.getByRole("button", { name: /Доплатите/ })).toBeVisible();
    await page.getByRole("button", { name: /Доплатите/ }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${debt.number}\\?shop=test2$`));
    await expect(page.getByRole("heading", { name: "Выдан", exact: true })).toBeVisible();
    await expect(page.getByText(/Доплатите/)).toBeVisible();
    const cabinetPath = "/seller?store=test2";
    const storefront = new URL("/?shop=test2", baseURL).href;
    await test.step("Блок 5 §13.3 · единый публичный адрес витрины", async () => {
      const [response] = await Promise.all([
        cabinet.waitForResponse(new URL("/api/seller/cabinet?store=test2", baseURL).href),
        cabinet.goto(cabinetPath),
      ]);
      expect(response.ok()).toBe(true);
      expect(await response.json()).toMatchObject({ current: { slug: "test2", storefrontUrl: storefront } });
      await page.goto(storefront);
      await expect(page).toHaveURL(storefront);
      await expect(page.getByRole("heading", { name: "Категории", exact: true })).toBeVisible();
    });
    await test.step("Блок 8 §12.7 · витрина внутри кабинета и возврат", async () => {
      const open = cabinet.getByRole("button", { name: "Открыть витрину как покупатель", exact: true });
      await expect(open).toBeVisible();
      await cabinet.screenshot({ path: "test-results/seller-storefront-390.png", animations: "disabled" });
      await open.click();
      await expect(cabinet).toHaveURL(`${storefront}&viewer=team`);
      await expect(cabinet.getByRole("heading", { name: "Витрина глазами покупателя", exact: true })).toBeVisible();
      await expect(cabinet.getByRole("heading", { name: "Категории", exact: true })).toBeVisible();
      await cabinet.getByRole("button", { name: "Вернуться в кабинет", exact: true }).click();
      await expect(cabinet).toHaveURL(new URL(cabinetPath, baseURL).href);
      await expect(open).toBeVisible();
    });
  } finally {
    await Promise.all([buyer.close(), seller.close()]);
  }
}
