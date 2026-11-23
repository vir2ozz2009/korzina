import { orderLineKey } from "../../../src/shared/contracts/order-changes";
import type { SellerOrderCommand, SellerTransition } from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";
import type { Seller } from "../../auth/roles";
import type { CommandIdentity } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { unpackOrder } from "../checkout/buyer-orders";
import { releaseOrderReservation } from "../checkout/order-reservation";
import { orderBalance, orderFinance, orderWorkflow } from "../checkout/order-workflow";
import { pendingComposition } from "../order-changes/state";
import { sellerOrder, sellerOrderRow } from "./order";
import { changePayment, paymentForTransition } from "./payment";
import { nextOrderStage } from "./transition";

function isTransition(input: SellerOrderCommand): input is SellerTransition {
  return ["accept", "markReady", "handOver", "markPickedUp", "complete", "rollback", "cancel"].includes(input.action);
}

export function permitted(actor: Seller, permission: "orders" | "assembly" | "payments") {
  if (actor.role !== "owner" && !actor.permissions.includes(permission))
    throw new ApiError("FORBIDDEN", "Недостаточно прав");
}

export function changeSellerOrder(
  env: ShopEnv["Bindings"],
  actor: Seller,
  number: number,
  input: SellerOrderCommand,
  identity: CommandIdentity,
) {
  const { storage } = env;
  const packing = input.action === "setAllPacked" || input.action === "setLinePacked";
  if (packing) permitted(actor, "assembly");
  if ((!packing && !isTransition(input)) || ("payment" in input && input.payment)) permitted(actor, "payments");
  return executeCommand(storage, env.db, `seller-order:${actor.accountId}:${number}`, identity, () => {
    const row = sellerOrderRow(storage, number);
    if (row.version !== input.expectedRevision)
      throw new ApiError("VERSION_CONFLICT", "Заказ изменился. Проверьте новый статус.");
    const snapshot = unpackOrder(row);
    const { mode } = snapshot.receiving;
    const work = orderWorkflow(row);
    const previous = orderFinance(work, snapshot, row.payment_status);
    const before = orderBalance(previous, snapshot.totalMinor, row.status);
    let finance = previous;
    let stage = row.status;
    let status = row.payment_status;
    let details: unknown;
    if (isTransition(input)) {
      stage = nextOrderStage(row.status, mode, input.action);
      if ((input.action === "handOver" || input.action === "markPickedUp") && pendingComposition(work.composition))
        throw new ApiError("ANOTHER_CHANGE_PENDING", "Сначала дождитесь ответа по замене");
      if (
        input.action === "markReady" &&
        (work.packed?.length ?? 0) < snapshot.lines.length &&
        !input.confirmIncomplete
      )
        throw new ApiError("VALIDATION", "Подтвердите завершение неполной сборки");
      if (input.action === "cancel") {
        const late = work.handedOff || (mode === "pickup" && (row.status === "ready" || work.readyForPickup));
        if (late && input.returnStock === undefined) throw new ApiError("VALIDATION", "Выберите, вернуть ли товар");
        releaseOrderReservation(storage, snapshot, !late || input.returnStock === true);
      }
      finance = paymentForTransition(finance, snapshot, stage, input);
      if ("payment" in input && input.payment && input.payment.method !== "debt")
        status = orderBalance(finance, snapshot.totalMinor, stage).outstandingMinor ? "unpaid" : "confirmed";
      work.handedOff ||= stage === "handed" || stage === "completed";
      work.readyForPickup ||= mode === "pickup" && (stage === "ready" || row.status === "ready");
      details = { from: row.status, to: stage };
    } else if (input.action === "setAllPacked" || input.action === "setLinePacked") {
      if (stage !== "accepted") throw new ApiError("INVALID_TRANSITION", "Заказ уже вышел из сборки");
      const lines = snapshot.lines.map(orderLineKey);
      const packed = new Set(work.packed);
      if (input.action === "setAllPacked") work.packed = input.packed ? lines : [];
      else {
        if (!lines.includes(input.line)) throw new ApiError("VALIDATION", "Позиция недоступна");
        if (input.packed) packed.add(input.line);
        else packed.delete(input.line);
        work.packed = [...packed];
      }
    } else {
      ({ finance, status, details } = changePayment(row, snapshot, finance, input));
    }
    const balance = orderBalance(finance, snapshot.totalMinor, stage);
    storage.sql.exec(
      "UPDATE orders SET status=?,payment_status=?,version=version+1,fulfillment_state=?,snapshot=? WHERE number=?",
      stage,
      status,
      JSON.stringify({ ...work, finance, debtMinor: balance.debtMinor, refundMinor: balance.refundMinor }),
      JSON.stringify(snapshot),
      number,
    );
    const { id } = storage.sql
      .exec<{ id: number }>(
        `INSERT INTO buyer_order_events(order_number,actor,event,created_at,reason,details)
       VALUES(?,?,?,?,?,?) RETURNING id`,
        number,
        actor.accountId,
        `order.${input.action}`,
        Date.now(),
        "reason" in input ? input.reason : null,
        details === undefined ? null : JSON.stringify(details),
      )
      .one();
    if (snapshot.telegramLinked) {
      const telegramId = /^telegram:(\d+)$/u.exec(row.customer)?.[1];
      if (telegramId) {
        const event =
          balance.debtMinor > 0 && balance.debtMinor !== before.debtMinor
            ? "debt"
            : balance.refundMinor > 0 && balance.refundMinor !== before.refundMinor
              ? "refund"
              : row.payment_status !== "confirmed" &&
                  status === "confirmed" &&
                  stage !== "cancelled" &&
                  finance.paidMinor > previous.paidMinor
                ? "paid"
                : undefined;
        if (event)
          storage.sql.exec(
            "INSERT INTO order_notification_outbox(event_key,kind,order_number,recipient,amount,currency,due_at) VALUES(?,?,?,?,?,?,?)",
            `payment:${id}`,
            event,
            number,
            telegramId,
            event === "debt" ? balance.debtMinor : balance.refundMinor,
            snapshot.currency,
            Date.now(),
          );
      }
    }
    env.changes.order(number);
    return { status: 200, body: sellerOrder(storage, number, actor, env.timeZone) };
  }).body;
}
