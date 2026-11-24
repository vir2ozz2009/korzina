import { expect, type Page } from "@playwright/test";
import type { OrderStage } from "../../src/shared/contracts/buyer-order";
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
  test(
    `#235 этапы ${mode === "delivery" ? "доставки" : "самовывоза"} не откатываются после действий продавца`,
    tag,
    async ({ page, seller, rememberOrder }) => {
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
    },
  );
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
