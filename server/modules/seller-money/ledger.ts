import type { RecordedPayment } from "../../../src/shared/contracts/seller-order";

type Order = { number: number; currency: string };

export function recordMoneyOperation(
  storage: DurableObjectStorage,
  order: Order,
  id: number,
  at: number,
  kind: "received" | "returned",
  amountMinor: number,
  method?: RecordedPayment["method"],
) {
  storage.sql.exec(
    `INSERT INTO seller_money_operations(id,number,occurred_at,currency,kind,amount_minor,method)
    VALUES(?,?,?,?,?,?,?)`,
    id,
    order.number,
    at,
    order.currency,
    kind,
    amountMinor,
    method ?? null,
  );
}

export function correctMoneyOperation(storage: DurableObjectStorage, number: number, payment: RecordedPayment) {
  // A legacy last payment may have been part of a transition with no recorded
  // payment fields. Do not move a correction onto an older, different receipt.
  storage.sql.exec(
    `UPDATE seller_money_operations SET amount_minor=?,method=?
      WHERE id=(SELECT id FROM seller_money_operations WHERE number=? AND kind='received' ORDER BY id DESC LIMIT 1)
        AND amount_minor IS NOT NULL`,
    payment.amountMinor,
    payment.method,
    number,
  );
}
