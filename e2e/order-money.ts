import { expect, type Page, test } from "@playwright/test";
import type { SellerOrder } from "../src/shared/contracts/seller-order";
import { formatMinor, minorInput } from "../src/shared/money";

const moneyRoot = "/seller/money?store=test2";

export async function checkMoneyTopUp(buyer: Page, seller: Page, number: number, amount: number, currency: string) {
  await test.step("Блок 11 · покупатель отправляет отдельный чек, продавец подтверждает его из задач", async () => {
    await buyer.goto(`/orders/${number}?shop=test2`, { waitUntil: "domcontentloaded" });
    const more = buyer.getByRole("button", { name: /^(Оплатить иначе|Доплатить)$/u });
    await more.click();
    const method = buyer.getByRole("dialog");
    await method
      .getByRole("radio", { name: /перевод/iu })
      .first()
      .check();
    await method.getByRole("button", { name: "Продолжить" }).click();
    await method.getByRole("button", { name: "Прикрепить чек" }).click();
    await method.locator("input[type=file]").setInputFiles({
      name: "receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF"),
    });
    await method.getByRole("button", { name: "Сохранить чек" }).click();
    await expect(buyer.getByText("Подтверждение отправлено · повторно платить не нужно")).toBeVisible();
    await buyer.screenshot({ path: "test-results/block11-buyer-top-up-390.png", animations: "disabled" });

    await seller.goto(moneyRoot, { waitUntil: "domcontentloaded" });
    await expect(seller.getByRole("heading", { name: "Задачи" })).toBeVisible();
    await expect(seller.getByRole("button", { name: /К получению сейчас/u })).toHaveCount(0);
    await seller.screenshot({ path: "test-results/block11-seller-money-390.png", animations: "disabled" });
    await seller.getByRole("button", { name: /Проверить чеки/u }).click();
    await seller.getByRole("button", { name: new RegExp(`^Заказ №${number}\\b`, "u") }).click();
    const review = seller.getByRole("dialog");
    await expect(review.getByText("Последний чек")).toBeVisible();
    await review.getByRole("button", { name: "Деньги пришли" }).click();
    await review.getByRole("textbox", { name: "Сумма" }).fill(minorInput(amount, currency));
    await review.getByRole("button", { name: /^Подтвердить/u }).click();
    await expect(seller.getByText("Задача уже закрыта")).toBeVisible();
    await buyer.reload({ waitUntil: "domcontentloaded" });
    await expect(buyer.getByText("Подтверждение отправлено · повторно платить не нужно")).toHaveCount(0);
  });
}

export async function checkMoneyRefund(buyer: Page, seller: Page, order: SellerOrder) {
  await test.step("Блок 11 · возврат по выполненному заказу, реквизиты и две выплаты", async () => {
    const detail = `/seller/orders/${order.number}?store=test2`;
    await seller.goto(detail, { waitUntil: "domcontentloaded" });
    await seller.getByRole("button", { name: "Открыть возврат", exact: true }).click();
    const form = seller.getByRole("dialog");
    const fill = (amount: number) =>
      form.getByRole("textbox", { name: "Сумма" }).fill(minorInput(amount, order.currency));
    await fill(60);
    await form.getByRole("button", { name: "Открыть возврат", exact: true }).click();
    await expect(seller.getByRole("button", { name: "Вернул", exact: true })).toBeVisible();

    await buyer.goto(`/orders/${order.number}?shop=test2`, { waitUntil: "domcontentloaded" });
    await buyer.getByRole("button", { name: "Указать реквизиты" }).click();
    await buyer.getByRole("textbox", { name: "Реквизиты" }).fill("Учебные реквизиты");
    await buyer.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(buyer.getByText("Реквизиты переданы, деньги ожидаются")).toBeVisible();
    await buyer.screenshot({ path: "test-results/block11-buyer-refund-390.png", animations: "disabled" });

    await seller.reload({ waitUntil: "domcontentloaded" });
    await expect(seller.getByText("Учебные реквизиты", { exact: true })).toBeVisible();
    const record = async (amount: number, note: string) => {
      await seller.getByRole("button", { name: "Вернул", exact: true }).click();
      await fill(amount);
      await form.getByRole("textbox", { name: "Комментарий" }).fill(note);
      await form.getByRole("button", { name: "Вернул", exact: true }).click();
      await expect(form).toBeHidden();
    };
    await record(20, "Учебный возврат, первая часть");
    await buyer.reload({ waitUntil: "domcontentloaded" });
    await expect(buyer.getByText(`Осталось вернуть ${formatMinor(40, order.currency)}`)).toBeVisible();
    await record(40, "Учебный возврат, остаток");
    await buyer.reload({ waitUntil: "domcontentloaded" });
    await expect(buyer.getByText("Деньги возвращены", { exact: true })).toBeVisible();
    await seller.goto(moneyRoot, { waitUntil: "domcontentloaded" });
    await seller.getByRole("button", { name: "Операции", exact: true }).click();
    await seller.getByRole("textbox", { name: "Номер заказа или точная сумма" }).fill(`№${order.number}`);
    await expect(seller.getByRole("button", { name: new RegExp(`Возврат Заказ №${order.number}`, "u") })).toHaveCount(
      2,
    );
    await seller.screenshot({ path: "test-results/block11-seller-operations-390.png", animations: "disabled" });
  });
}
