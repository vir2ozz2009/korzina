import { expect, type Page } from "@playwright/test";
import type { OrderStage } from "../../src/shared/contracts/buyer-order";
import { checkDelivery } from "../promo-delivery";
import { checkPromoReportRevocation } from "../promo-report-revocation";
import {
  anywhere,
  cabinet,
  configure,
  hours,
  orderDetail,
  placeOrder,
  resume,
  storefront,
  test,
  transition,
} from "./fixture";

const tag = { tag: "@regression" };

test("Блок 11 · сценарий 10 возвращает фокус на кнопку периода", tag, async ({ seller }) => {
  for (const path of ["/seller/money", "/seller/money/operations"]) {
    await seller.goto(`${path}?${cabinet}`);
    const trigger = seller.getByRole("button", { name: "Период", exact: true });
    const sheet = seller.getByRole("dialog", { name: "Период", exact: true });
    const close = sheet.getByRole("button", { name: "Закрыть", exact: true });
    await trigger.focus();
    await seller.keyboard.press("Enter");
    await close.focus();
    await seller.keyboard.press("Enter");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();

    await seller.keyboard.press("Enter");
    await close.focus();
    await seller.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test.beforeEach(async ({ seller }) => {
  await configure(seller.request, { delivery: anywhere, requiredDetails: [], minimumMinor: 120000 });
  await resume(seller.request);
});

async function clickStage(seller: Page, number: number, name: string, stage: OrderStage, confirmation?: string) {
  await seller.getByRole("button", { name, exact: true }).click();
  if (confirmation) await seller.getByRole("dialog").getByRole("button", { name: confirmation, exact: true }).click();
  await expect.poll(async () => (await orderDetail(seller.request, number)).stage).toBe(stage);
}

for (const mode of ["delivery", "pickup"] as const) {
  test(`#235 этапы ${mode === "delivery" ? "доставки" : "самовывоза"} не откатываются после действий продавца`, {
    tag: [tag.tag, "@demo-heavy"],
  }, async ({ page, seller, rememberOrder }) => {
    await hours(seller.request, "after_order");
    try {
      const order = await placeOrder(page, mode);
      rememberOrder(order.number);
      await seller.goto(`/seller/orders/${order.number}?${cabinet}`);
      await clickStage(seller, order.number, "Принять", "accepted");
      await expect(seller.getByRole("button", { name: "Принять", exact: true })).toHaveCount(0);
      await seller.getByRole("button", { name: "Отметить все собранными" }).click();
      await expect(seller.getByText("Собрано 1 из 1")).toBeVisible();
      await clickStage(seller, order.number, "Сборка завершена", "ready");
      await transition(seller.request, order.number, {
        action: "recordPayment",
        method: "cash",
        amountMinor: order.totalMinor,
      });
      await seller.reload();
      if (mode === "delivery") {
        await clickStage(seller, order.number, "Передать курьеру", "handed", "Подтвердить");
        await expect(seller.getByRole("button", { name: "Передать курьеру", exact: true })).toHaveCount(0);
        await clickStage(seller, order.number, "Доставлен", "completed", "Подтвердить");
      } else {
        await clickStage(seller, order.number, "Выдать заказ", "completed", "Подтвердить");
      }
      await expect(
        seller.getByRole("button", { name: mode === "delivery" ? "Доставлен" : "Выдать заказ", exact: true }),
      ).toHaveCount(0);
    } finally {
      await hours(seller.request, "2");
    }
  });
}

test("Блок 9 · 2 на Главной скрыты срочные действия с нулём", tag, async ({ seller }) => {
  await seller.goto(`/seller?${cabinet}`);
  await expect(seller.getByRole("heading", { name: "По этапам" })).toBeVisible();
  await expect(seller.getByText("Срочных дел нет")).toBeVisible();
  await expect(seller.getByRole("heading", { name: "Требуют действия" })).toHaveCount(0);
  await expect(seller.getByRole("button", { name: /Долги клиентов/ })).toHaveCount(0);
});

test("Блок 9 · 3 список сборки открывает заказ без времени", tag, async ({ page, seller, rememberOrder }) => {
  await hours(seller.request, "after_order");
  try {
    const order = await placeOrder(page);
    rememberOrder(order.number);
    await transition(seller.request, order.number, { action: "accept" });
    await seller.goto(`/seller?${cabinet}`);
    await seller.getByRole("button", { name: "Список сборки", exact: true }).click();
    await expect(seller.getByRole("heading", { name: "Список сборки", exact: true })).toBeVisible();
    await seller
      .getByRole("button", { name: new RegExp(order.lines[0].name) })
      .first()
      .click();
    await seller
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(`^№${order.number} ·`) })
      .click();
    await expect(seller.getByRole("heading", { name: `Заказ №${order.number}` })).toBeVisible();
  } finally {
    await hours(seller.request, "2");
  }
});

test("Блок 7 · пауза приёма видна на витрине и снимается", tag, async ({ page, seller }) => {
  const banner = "QA1 · Приём ненадолго на паузе";
  await seller.goto(`/seller?${cabinet}`);
  await seller.getByRole("button", { name: "Приостановить приём", exact: true }).click();
  const pause = seller.getByRole("dialog", { name: "Приостановить приём" });
  try {
    await pause.getByRole("button", { name: "Доставка", exact: true }).click();
    await pause.getByLabel("Сообщение покупателям").fill(banner);
    await pause.getByRole("button", { name: "Приостановить", exact: true }).click();
    await expect(pause).toBeHidden();
    await page.goto(`/?${storefront}`);
    await expect(page.getByRole("status").filter({ hasText: banner })).toBeVisible();
    await seller.getByRole("button", { name: "Возобновить", exact: true }).first().click();
    await expect(seller.getByRole("button", { name: "Возобновить", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(banner)).toHaveCount(0);
  } finally {
    await resume(seller.request);
  }
});

test("12.1 §11 · K4c: 403 закрывает отчёт, суммы и детализацию", { tag: "@regression" }, ({ page }) =>
  checkPromoReportRevocation(page),
);

test("12.3 · готовый пример и порог доставки не требуют ручной подготовки", tag, async ({ page }) => {
  test.setTimeout(90_000);
  await checkDelivery(page, "e2e");
});
