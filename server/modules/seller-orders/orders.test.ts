import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import type { SellerOrder, SellerOrderCommand, SellerOrderPage } from "../../../src/shared/contracts/seller-order";
import { assertSqlBudget, type SqlMetrics } from "../../metrics";
import { storefrontUrl } from "../../platform/storefront-url";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { placeFixtureOrder, proof, signIn, snapshot } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, catalogStub } from "../catalog/testing";
import { mediaPrefix } from "../media/objects";
import { telegramMessage } from "./notifications";

const shop = "korzina-demo-lavka";
beforeAll(setupPlatform);

async function fixture() {
  const buyer = await signIn(snapshot.phone ?? "");
  const seller = await sellerFixture(shop);
  const receipt = await proof(buyer.subject, "attached");
  const number = await placeFixtureOrder(buyer.subject, receipt);
  const path = `/api/seller/orders/${number}`;
  const call = (
    input: Omit<SellerOrderCommand, "expectedRevision"> & Record<string, unknown>,
    revision: number,
    key = crypto.randomUUID(),
  ) =>
    postAuth(
      `${path}/transition?store=lavka`,
      { ...input, expectedRevision: revision },
      { ...seller.headers, "Idempotency-Key": key },
    );
  return { buyer, seller, number, receipt, path, call };
}

it("§9.2, §11.4, §12.4: сборка, выдача в долг и повтор, доплата снимает долг у обеих ролей", async () => {
  const { buyer, seller, number, call } = await fixture();
  expect((await call({ action: "accept" }, 0)).status).toBe(200);
  expect((await call({ action: "setAllPacked", packed: true }, 1)).status).toBe(200);
  expect((await call({ action: "markReady" }, 2)).status).toBe(200);
  expect((await call({ action: "markPickedUp" }, 3)).status).toBe(400);
  const input = { action: "markPickedUp", payment: { method: "debt" } } as const;
  const key = crypto.randomUUID();
  const handoff = await (await call(input, 3, key)).json<SellerOrder>();
  expect(handoff).toMatchObject({ stage: "completed", revision: 4, balance: { debtMinor: 49000 } });
  expect(await (await call(input, 3, key)).json()).toEqual(handoff);
  const debt = () => getAuth("/api/seller/orders?store=lavka&tab=completed&debt=1", seller.headers);
  expect(await (await debt()).json()).toMatchObject({ orders: [{ number, debtMinor: 49000 }] });
  const active = () => getAuth("/api/orders/active?shop=lavka", { Cookie: buyer.Cookie });
  expect(await (await active()).json()).toMatchObject({ data: { orders: [{ number, debtMinor: 49000 }] } });
  const result = await call({ action: "recordPayment", method: "cash", amountMinor: 49000 }, 4);
  expect(await result.json()).toMatchObject({
    stage: "completed",
    paymentStatus: "confirmed",
    balance: { debtMinor: 0 },
  });
  expect(await (await active()).json()).toMatchObject({ data: { orders: [] } });
  expect(await (await debt()).json()).toMatchObject({ orders: [] });
});

it("§9.3, §10.6: документ чека закрыт по праву, исправление сохраняет автора, время и прежнее поступление", async () => {
  const { seller, receipt, path, number, call } = await fixture();
  const document = "%PDF-1.7\nTest receipt";
  await env.MEDIA.put(`${mediaPrefix(shop, receipt)}original.pdf`, document);
  const file = `${path}/receipts/${receipt}?store=lavka`;
  const employee = await sellerFixture(shop, "employee");
  expect((await getAuth(file, employee.headers)).status).toBe(403);
  const authorized = await getAuth(file, seller.headers);
  expect(authorized.headers.get("Content-Type")).toBe("application/pdf");
  expect(new TextDecoder().decode(await authorized.arrayBuffer())).toBe(document);
  expect(
    (await getAuth(`/api/seller/orders/${number + 1}/receipts/${receipt}?store=lavka`, seller.headers)).status,
  ).toBe(404);
  const confirmed = await call({ action: "confirmTransfer", proof: receipt, amountMinor: 60000 }, 0);
  expect(await confirmed.json()).toMatchObject({ balance: { refundMinor: 11000 }, paymentStatus: "confirmed" });
  const started = Date.now();
  const corrected = await (
    await call({ action: "correctPayment", method: "cash", amountMinor: 40000 }, 1)
  ).json<SellerOrder>();
  expect(corrected.balance).toMatchObject({ refundMinor: 0, debtMinor: 9000 });
  const saved = corrected.events[0];
  expect(saved).toMatchObject({ event: "order.correctPayment", actor: seller.accountId });
  expect(saved.createdAt).toBeGreaterThanOrEqual(started);
  expect(JSON.parse(saved.details ?? "{}")).toEqual({
    previous: { method: "transfer", amountMinor: 60000 },
    current: { method: "cash", amountMinor: 40000 },
  });
});

it("§10.10, D05: покупатель в «Оформлен» отменяет оплаченный заказ и видит сумму возврата", async () => {
  const { number, buyer, seller, path, call } = await fixture();
  expect((await call({ action: "recordPayment", method: "transfer", amountMinor: 38000 }, 0)).status).toBe(200);
  const cancel = await postAuth(
    `/api/orders/${number}/cancel?shop=lavka`,
    { expectedVersion: 1 },
    { Cookie: buyer.Cookie },
  );
  expect(await cancel.json()).toMatchObject({ stage: "cancelled", refundMinor: 38000 });
  expect(await (await getAuth(`${path}?store=lavka`, seller.headers)).json()).toMatchObject({
    stage: "cancelled",
    balance: { refundMinor: 38000, debtMinor: 0 },
  });
});

it("§9.5, §9.7, §12: счётчики всего магазина и фильтра по номеру, ревизия без чтения строк", async () => {
  const { seller, number } = await fixture();
  const { number: other, call } = await fixture();
  expect((await call({ action: "accept" }, 0)).status).toBe(200);
  const list = (query = "") => getAuth(`/api/seller/orders?store=lavka${query}`, seller.headers);
  const all = await (await list()).json<SellerOrderPage>();
  const selected = await (await list(`&search=%E2%84%96${other}`)).json<SellerOrderPage>();
  expect(selected).toMatchObject({
    active: all.active,
    newlyPlaced: all.newlyPlaced,
    counts: { accepted: 1 },
    orders: [{ number: other, stage: "accepted" }],
  });
  expect(all.orders.find((entry) => entry.number === number)?.stage).toBe("placed");
  const { rev, timeZone } = all;
  expect(await (await list(`&rev=${rev}`)).json()).toEqual({ rev, timeZone, unchanged: true });
  const metadata = { id: shop, slug: "lavka", name: "Тест", status: "active", plan: "base", createdAt: 0 };
  const direct = (path: string) =>
    catalogStub().fetch(
      new Request(`https://demo.korzina.app/api/seller/orders${path}`, {
        headers: { ...seller.headers, "x-korzina-shop": encodeURIComponent(JSON.stringify(metadata)) },
      }),
    );
  for (const [path, limit] of [
    [`?rev=${all.rev}`, 1],
    [`/${other}`, 4],
  ] as const) {
    const response = await direct(path);
    expect(response.ok).toBe(true);
    const metrics: SqlMetrics = JSON.parse(response.headers.get("x-korzina-sql") ?? "null");
    assertSqlBudget(metrics, { sql: limit });
  }
  const index = await catalogSql("SELECT stage,revision FROM seller_order_index WHERE number=?", other);
  expect(index).toEqual([{ stage: "accepted", revision: 1 }]);
});

it("§9.6 и §10.9: уведомления покупателя ставятся в outbox один раз, гость уведомления не получает", async () => {
  const { number, call } = await fixture();
  await catalogSql(
    "UPDATE orders SET customer='telegram:990000033',snapshot=json_set(snapshot,'$.telegramLinked',json('true')) WHERE number=?",
    number,
  );
  const input = { action: "recordPayment", method: "transfer", amountMinor: 40000 } as const;
  const key = crypto.randomUUID();
  expect((await call(input, 0, key)).status).toBe(200);
  expect((await call(input, 0, key)).status).toBe(200);
  expect((await call({ ...input, amountMinor: 9000 }, 1)).status).toBe(200);
  expect((await call({ ...input, amountMinor: 2000 }, 2)).status).toBe(200);
  const events = await catalogSql(
    "SELECT kind,recipient,amount FROM order_notification_outbox WHERE order_number=? ORDER BY rowid",
    number,
  );
  expect(events).toEqual([
    { kind: "debt", recipient: "990000033", amount: 9000 },
    { kind: "paid", recipient: "990000033", amount: 0 },
    { kind: "refund", recipient: "990000033", amount: 2000 },
  ]);
  const guest = await fixture();
  expect((await guest.call(input, 0)).status).toBe(200);
  expect(
    await catalogSql("SELECT event_key FROM order_notification_outbox WHERE order_number=?", guest.number),
  ).toEqual([]);
});

it("§9.4, D18: поздний тариф после полной оплаты создаёт одну доплату магазину или сумму курьеру", async () => {
  const shopPay = await fixture();
  const courierPay = await fixture();
  for (const [order, payee] of [
    [shopPay, "shop"],
    [courierPay, "courier"],
  ] as const) {
    const delivery = { mode: "delivery", available: true, tariff: "after_order", feeMinor: null, payee };
    await catalogSql(
      "UPDATE orders SET snapshot=json_set(snapshot,'$.receiving',json(?),'$.fulfillment',json(?)) WHERE number=?",
      JSON.stringify({ mode: "delivery", address: "Тестовый адрес" }),
      JSON.stringify(delivery),
      order.number,
    );
    expect((await order.call({ action: "recordPayment", method: "cash", amountMinor: 49000 }, 0)).status).toBe(200);
    const updated = await order.call({ action: "setDeliveryFee", amountMinor: 3000 }, 1);
    expect(await updated.json()).toMatchObject({
      deliveryAssigned: true,
      fulfillment: { feeMinor: 3000, payee },
      totalMinor: payee === "shop" ? 52000 : 49000,
      balance: { debtMinor: payee === "shop" ? 3000 : 0 },
    });
  }
});

it("§3.5: «Новый заказ» отделяет сумму от даты, времени и способа получения в поясе магазина", async () => {
  const { number } = await fixture();
  await runInDurableObject(catalogStub(), (_instance, { storage }) => {
    storage.sql.exec(
      "UPDATE settings SET value=json_set(value,'$.timeZone','America/Los_Angeles') WHERE key='receiving_schedule'",
    );
    // The shop is still on 20 November after midnight UTC.
    const now = Date.parse("2026-11-21T03:30:00Z");
    const event = {
      kind: "new",
      order_number: number,
      recipient: "990000001",
      amount: 151000,
      currency: "VND",
    };
    const cases = [
      [{ date: "2026-11-20", slotId: "10:00-12:00" }, "delivery", "Сегодня, 20 ноября · 10:00 · Доставка"],
      [{ date: "2026-11-21", slotId: "10:00-12:00" }, "delivery", "Завтра, 21 ноября · 10:00 · Доставка"],
      [{ date: "2026-11-27", slotId: "15:30-17:00" }, "pickup", "Пт, 27 ноября · 15:30 · Самовывоз"],
      [{ date: "2026-11-21" }, "pickup", "Завтра, 21 ноября · Время согласуем · Самовывоз"],
      [null, "delivery", "Время согласуем · Доставка"],
    ] as const;
    for (const [time, method, deliveryLine] of cases) {
      storage.sql.exec(
        "UPDATE orders SET snapshot=json_set(snapshot,'$.time',json(?),'$.receiving.mode',?) WHERE number=?",
        JSON.stringify(time),
        method,
        number,
      );
      const message = telegramMessage(storage, "https://demo.korzina.app", shop, event, now);
      expect(message.text).toBe(`Новый заказ №${number} · 151\u00a0000\u00a0₫\n${deliveryLine}\nТоматы · 500 г × 1`);
    }
  });
});

it("§13.1: кнопки в Telegram открывают заказ покупателя в нужном магазине", async () => {
  await runInDurableObject(catalogStub(), (_instance, { storage }) => {
    const origin = "https://preview.example.com";
    for (const [appEnv, url] of [
      ["preview", "https://preview.example.com/orders/9?shop=test2"],
      ["production", "https://test2.korzina.app/orders/9"],
    ] as const) {
      const storefront = storefrontUrl(origin, appEnv, "test2");
      for (const kind of ["debt", "refund", "paid"]) {
        const event = {
          kind,
          order_number: 9,
          recipient: "990000033",
          amount: 3000,
          currency: "VND",
        };
        expect(telegramMessage(storage, origin, shop, event, 0, storefront).reply_markup).toEqual({
          inline_keyboard: [[{ text: "Открыть заказ", web_app: { url } }]],
        });
      }
    }
  });
});

it("§11.4, §11.6: каждый новый чек и каждый этап ставятся в очередь один раз", async () => {
  const { number, call, buyer } = await fixture();
  await catalogSql(
    "UPDATE orders SET customer='telegram:990000033',snapshot=json_set(snapshot,'$.telegramLinked',json('true')) WHERE number=?",
    number,
  );
  expect((await call({ action: "accept" }, 0)).status).toBe(200);
  expect((await call({ action: "rollback", reason: "Повторная проверка" }, 1)).status).toBe(200);
  expect((await call({ action: "accept" }, 2)).status).toBe(200);
  expect((await call({ action: "setAllPacked", packed: true }, 3)).status).toBe(200);
  expect((await call({ action: "markReady" }, 4)).status).toBe(200);
  const replacement = await proof(buyer.subject, "attached");
  await catalogSql("UPDATE orders SET proof_media_id=? WHERE number=?", replacement, number);
  await catalogSql("UPDATE orders SET proof_media_id=? WHERE number=?", replacement, number);
  expect(
    await catalogSql("SELECT kind,recipient FROM workday_notice WHERE order_number=? ORDER BY rowid", number),
  ).toEqual([
    { kind: "receipt", recipient: null },
    { kind: "accepted", recipient: "990000033" },
    { kind: "ready", recipient: "990000033" },
    { kind: "receipt", recipient: null },
  ]);
});
