import { ApiError } from "../../../src/shared/errors";
import type { CommandIdentity } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { buyerOrder, buyerOrderRow, unpackOrder } from "./buyer-orders";
import { releaseOrderReservation } from "./order-reservation";
import { orderBalance, orderFinance, orderWorkflow } from "./order-workflow";

type Shop = ShopEnv["Bindings"];
function checkVersion(actual: number, expected: number) {
  if (actual !== expected) throw new ApiError("VERSION_CONFLICT", "Заказ изменился. Обновите карточку.");
}

export function cancelBuyerOrder(
  env: Shop,
  customer: string,
  number: number,
  expected: number,
  command: CommandIdentity,
) {
  const { storage } = env;
  return executeCommand(storage, env.db, `order-cancel:${customer}:${number}`, command, () => {
    const row = buyerOrderRow(storage, customer, number);
    const current = buyerOrder(row);
    if (!current.canCancel)
      throw new ApiError(
        "CANCEL_NOT_ALLOWED",
        current.receiving.mode === "pickup"
          ? "Заказ уже выдан — отменить нельзя"
          : "Заказ уже передан — отменить нельзя",
        current,
      );
    checkVersion(row.version, expected);
    const snapshot = unpackOrder(row);
    const work = orderWorkflow(row);
    const finance = orderFinance(work, snapshot, row.payment_status);
    const { refundMinor } = orderBalance(finance, snapshot.totalMinor, "cancelled");
    releaseOrderReservation(storage, snapshot, true);
    const fulfillment_state = JSON.stringify({ ...work, finance, refundMinor, debtMinor: 0 });
    storage.sql.exec(
      "UPDATE orders SET status='cancelled',version=version+1,fulfillment_state=? WHERE number=?",
      fulfillment_state,
      number,
    );
    storage.sql.exec(
      "INSERT INTO buyer_order_events(order_number,actor,event,created_at) VALUES(?,?,'order.cancelled',?)",
      number,
      customer,
      Date.now(),
    );
    const telegramId = snapshot.telegramLinked && /^telegram:(\d+)$/u.exec(customer)?.[1];
    if (telegramId && refundMinor)
      storage.sql.exec(
        "INSERT OR IGNORE INTO order_notification_outbox(event_key,kind,order_number,recipient,amount,currency,due_at) VALUES(?,'refund',?,?,?,?,?)",
        `buyer-cancel:${number}`,
        number,
        telegramId,
        refundMinor,
        snapshot.currency,
        Date.now(),
      );
    env.changes.order(number);
    return {
      status: 200,
      body: buyerOrder({ ...row, fulfillment_state, status: "cancelled", version: row.version + 1 }),
    };
  }).body;
}

export function replaceBuyerProof(
  env: Shop,
  customer: string,
  number: number,
  expected: number,
  mediaId: string,
  command: CommandIdentity,
) {
  const { storage } = env;
  return executeCommand(storage, env.db, `order-proof:${customer}:${number}`, command, () => {
    const row = buyerOrderRow(storage, customer, number);
    if (!buyerOrder(row).canReplaceProof)
      throw new ApiError("VERSION_CONFLICT", "Магазин уже проверил оплату", buyerOrder(row));
    checkVersion(row.version, expected);
    const now = Date.now();
    const media = storage.sql.exec(
      "UPDATE media SET status='attached',expires_at=NULL WHERE id=? AND owner=? AND purpose='receipt' AND status='temp' AND ready=1 AND expires_at>?",
      mediaId,
      customer,
      now,
    );
    if (!media.rowsWritten) throw new ApiError("VALIDATION", "Чек недоступен. Прикрепите файл повторно.");
    if (row.proof_media_id)
      storage.sql.exec(
        "INSERT INTO order_receipt_history(order_number,media_id,created_at) VALUES(?,?,?)",
        number,
        row.proof_media_id,
        now,
      );
    storage.sql.exec(
      "UPDATE orders SET proof_media_id=?,payment_status='pending_review',version=version+1 WHERE number=?",
      mediaId,
      number,
    );
    env.changes.order(number);
    return {
      status: 200,
      body: buyerOrder({ ...row, payment_status: "pending_review", proof_media_id: mediaId, version: row.version + 1 }),
    };
  }).body;
}
