import { getTableColumns, getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { expect, it } from "vitest";
import * as schema from "../../shop/schema";
import { buyerMergeSteps } from "./merge";

const exceptions = {
  buyer_order_events: "События связаны с заказом. Идентификатор автора остаётся частью истории.",
  buyer_order_revisions: "Ревизии обоих покупателей обновляет триггер переноса заказа.",
  checkout_quotes: "Временный расчёт оформляется заново после смены сессии.",
  checkout_receipts: "Временная привязка чека принадлежит прежнему расчёту. Чеки заказов переносятся с заказом.",
  customer_telegram_exchanges: "Код обмена принадлежит исходной сессии и расходуется при входе.",
  promo_offers: "Автор предложения — продавец, а не покупатель. При входе покупателя автор не меняется.",
  sessions: "Исходные гостевые сессии отзываются в транзакции входа.",
};

it("R3: каждая таблица с покупателем в схеме покрыта слиянием или объяснённым исключением", () => {
  const tables = Object.values(schema).filter((table) => is(table, SQLiteTable));
  const tableNames = tables.map(getTableName);
  const handled = [...buyerMergeSteps.flatMap(({ tables }) => [...tables]), ...Object.keys(exceptions)];
  expect(new Set(handled).size).toBe(handled.length);
  expect(tableNames).toEqual(expect.arrayContaining(handled));

  const missing = tables
    .filter((table) =>
      Object.values(getTableColumns(table)).some(({ name }) =>
        /(?:^|_)(customer|owner|subject|actor)(?:_id)?$/.test(name),
      ),
    )
    .map(getTableName)
    .filter((name) => !handled.includes(name));
  expect(missing).toEqual([]);
});
