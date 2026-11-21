import { exports } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { getAuth, sellerFixture } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { readUpload } from "../media/content";
import { buy, customer, getQuote, setupCheckout } from "./testing";

beforeAll(async () => {
  await setupPlatform();
  await setupCheckout();
});

const settingsPath = "/api/seller/payments/settings?store=lavka";
const save = (body: object, headers: Record<string, string>) =>
  exports.default.fetch(
    new Request(`https://demo.korzina.app${settingsPath}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body),
    }),
  );

it("§11.3 §12.5 способы перечисляются по порядку, реквизиты доступны только с правом «Деньги»", async () => {
  const manager = await sellerFixture("korzina-demo-lavka", "employee", ["payments"]);
  const employee = await sellerFixture("korzina-demo-lavka", "employee");
  const card = {
    id: crypto.randomUUID(),
    template: "card",
    name: "Перевод продавцу",
    description: "Через банк",
    instruction: "Тестовая инструкция",
    details: "Тестовые реквизиты",
    requiresReceipt: false,
    enabled: true,
  };
  const cash = { id: "cash", template: "cash", name: "Наличные", requiresReceipt: false, enabled: true };
  const form = { expectedRevision: 0, options: [card, cash] };
  expect((await save(form, employee.headers)).status).toBe(403);
  const applied = await save(form, manager.headers);
  expect(applied.status, await applied.clone().text()).toBe(200);
  expect(await (await getAuth(settingsPath, employee.headers)).json()).toEqual({
    revision: 1,
    author: manager.accountId,
    updatedAt: expect.any(Number),
    canWrite: false,
    options: [
      { id: card.id, name: card.name, template: "card" },
      { id: "cash", name: cash.name, template: "cash" },
    ],
  });
  expect((await save(form, manager.headers)).status).toBe(409);
  const buyer = await customer("sku-01");
  const oldQuote = await getQuote(buyer);
  expect(oldQuote.paymentSettings.options?.map(({ id }) => id)).toEqual([card.id, "cash"]);
  const result = await buy(
    "checkout",
    {
      quoteRevision: oldQuote.quoteRevision,
      payment: "transfer",
      methodId: card.id,
    },
    buyer,
  );
  expect(result.status, await result.clone().text()).toBe(201);
  const order = await result.json<{ number: number }>();
  const otherBuyer = await customer("sku-01");
  const otherQuote = await getQuote(otherBuyer);
  expect(
    (await save({ expectedRevision: 1, options: [cash, { ...card, enabled: false }] }, manager.headers)).status,
  ).toBe(200);
  expect(
    await (
      await buy(
        "checkout",
        {
          quoteRevision: otherQuote.quoteRevision,
          payment: "transfer",
          methodId: card.id,
        },
        otherBuyer,
      )
    ).json(),
  ).toMatchObject({ error: { code: "PAYMENT_METHOD_UNAVAILABLE" } });
  expect(
    await (await getAuth(`/api/checkout/orders/${order.number}?shop=lavka`, { Cookie: buyer })).json(),
  ).toMatchObject({ paymentOption: { id: card.id, name: card.name, enabled: true }, paymentStatus: "unpaid" });
});

it("§13.4 картинка до 1 МБ принимается без распознавания QR, PDF и превышение размера отклоняются", async () => {
  const file = (body: BodyInit) => new Request("https://example.invalid/file", { method: "POST", body });
  const png = new Uint8Array(1024 * 1024);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  await expect(readUpload(file(png), true)).resolves.toHaveLength(png.length);
  await expect(readUpload(file(new Uint8Array(png.length + 1)), true)).rejects.toMatchObject({
    code: "PAYLOAD_TOO_LARGE",
  });
  await expect(readUpload(file("%PDF-1.4"), true)).rejects.toMatchObject({ code: "VALIDATION" });
});
