import { expect, type Page } from "@playwright/test";
import type { OrderResult } from "../../src/shared/contracts/checkout";
import { anywhere, configure, hours, json, prepareCart, resume, storefront, test } from "./fixture";

const tag = { tag: "@regression" };

test.beforeEach(async ({ seller }) => {
  await configure(seller.request, { delivery: anywhere, requiredDetails: [], minimumMinor: 120000 });
  await resume(seller.request);
});

async function orderFromPayment(page: Page, payment: "cash" | "transfer") {
  await page.getByRole("radio", { name: payment === "cash" ? /^Наличные(?: при получении)?$/ : "Перевод" }).check();
  if (payment === "transfer") {
    await expect(page.getByRole("img", { name: "QR для перевода" })).toBeVisible();
    await page.locator('input[type="file"][aria-label="Чек"]').setInputFiles({
      name: "qa1-receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n%%EOF\n"),
    });
    await expect(page.getByText("qa1-receipt.pdf")).toBeVisible();
  }
  const [response] = await Promise.all([
    page.waitForResponse(
      (result) => new URL(result.url()).pathname === "/api/checkout" && result.request().method() === "POST",
    ),
    page.getByRole("button", { name: /^Оформить заказ/ }).click(),
  ]);
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({ payment });
  return (await response.json()) as OrderResult;
}

async function openPayment(page: Page) {
  await prepareCart(page, "pickup");
  await page.goto(`/checkout/receiving?${storefront}`);
  await page.getByRole("button", { name: /^К оплате/ }).click();
  await expect(page.getByRole("heading", { name: "Оплата", exact: true })).toBeVisible();
  await expect(page.getByText("Номер для заказа")).toBeVisible();
}

for (const payment of ["cash", "transfer"] as const) {
  test(
    `B10 / B11 гость оформляет заказ ${payment === "cash" ? "наличными" : "переводом"} и видит готовый заказ`,
    tag,
    async ({ page, seller, rememberOrder }) => {
      await hours(seller.request, "after_order");
      try {
        await openPayment(page);
        const order = await orderFromPayment(page, payment);
        rememberOrder(order.number);
        const heading = page.getByRole("heading", { name: `Заказ №${order.number}`, exact: true });
        await expect(heading).toBeVisible();
        await expect(page.getByText("Заказ сохранён")).toBeVisible();
        await expect(page.getByText(payment === "cash" ? /Оплатите.*при получении/ : /Чек отправлен/)).toBeVisible();
        await page.getByRole("button", { name: "Открыть заказ", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/orders/${order.number}\\?shop=`));
        await page.reload();
        await expect(heading).toBeVisible();
      } finally {
        await hours(seller.request, "2");
      }
    },
  );
}

test("Блок 9 · 5а при пустом расписании можно заказать без времени", tag, async ({ page, seller, rememberOrder }) => {
  await hours(seller.request, "2", true);
  try {
    await openPayment(page);
    const order = await orderFromPayment(page, "cash");
    rememberOrder(order.number);
    expect(order.time).toBeNull();
    await expect(page.getByRole("heading", { name: `Заказ №${order.number}` })).toBeVisible();
  } finally {
    await hours(seller.request, "2");
  }
});

test("Блок 9 · 5 на витрине нет «закрыто» при пустом расписании", tag, async ({ page, seller }) => {
  await hours(seller.request, "2", true);
  try {
    await page.goto(`/?${storefront}`);
    await expect(page.getByText(/Время уточнит магазин после заказа/).first()).toBeVisible();
    await expect(page.getByText(/закрыто/i)).toHaveCount(0);
    expect(await json(await page.request.get(`/api/receiving/next?${storefront}`))).toMatchObject({
      methods: expect.arrayContaining([expect.objectContaining({ mode: "unknown" })]),
    });
  } finally {
    await hours(seller.request, "2");
  }
});
