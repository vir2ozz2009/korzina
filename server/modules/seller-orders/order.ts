import type { SellerOrder, SellerOrderEvent } from "../../../src/shared/contracts/seller-order";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import type { Seller } from "../../auth/roles";
import { type OrderRow, unpackOrder } from "../checkout/buyer-orders";
import { openOrderRefund } from "../checkout/order-refund";
import { orderBalance, orderFinance, orderWorkflow } from "../checkout/order-workflow";
import { orderComposition, orderTimeChange } from "../order-changes/state";
import { availableOrderRefund } from "./refunds";

export function sellerOrderRow(storage: DurableObjectStorage, number: number) {
  const row = storage.sql
    .exec<OrderRow>(
      "SELECT customer,number,created_at,status,payment_status,version,proof_media_id,snapshot,fulfillment_state FROM orders WHERE number=?",
      number,
    )
    .toArray()[0];
  if (!row) throw new ApiError("NOT_FOUND", "Заказ недоступен");
  return row;
}

export function sellerOrder(
  storage: DurableObjectStorage,
  number: number,
  actor: Seller,
  timeZone = defaultShopTimeZone,
): SellerOrder {
  const row = sellerOrderRow(storage, number);
  const saved = unpackOrder(row);
  const { seatReserved: _seat, reservedStock: _stock, customerNameKey: _nameKey, ...snapshot } = saved;
  const state = orderWorkflow(row);
  const finance = orderFinance(state, snapshot, row.payment_status);
  const permissions = {
    chat: actor.role === "owner" || actor.permissions.includes("chat"),
    assembly: actor.role === "owner" || actor.permissions.includes("assembly"),
    payments: actor.role === "owner" || actor.permissions.includes("payments"),
  };
  const events = storage.sql
    .exec<SellerOrderEvent>(
      "SELECT id,actor,event,created_at AS createdAt,reason,details FROM buyer_order_events WHERE order_number=? AND event NOT IN ('chat.buyer','chat.seller') ORDER BY id DESC LIMIT 100",
      number,
    )
    .toArray();
  const topProof = state.topUp?.proof ?? null;
  const latestProof = row.payment_status === "pending_review" ? row.proof_media_id : (topProof ?? row.proof_media_id);
  const receipts = permissions.payments
    ? storage.sql
        .exec<{ id: string; createdAt: number; mime: string }>(
          `SELECT id, created_at AS createdAt, mime FROM media
       WHERE status='attached' AND ready=1 AND purpose='receipt'
       AND (id=? OR id=? OR id IN (SELECT media_id FROM order_receipt_history WHERE order_number=?))
       ORDER BY id=? DESC, created_at DESC LIMIT 100`,
          row.proof_media_id,
          topProof,
          number,
          latestProof,
        )
        .toArray()
    : [];
  const balance = orderBalance(finance, snapshot.totalMinor, row.status);
  return {
    ...snapshot,
    number,
    stage: row.status,
    revision: row.version,
    createdAt: row.created_at,
    paymentStatus: row.payment_status,
    composition: orderComposition({ row, snapshot, work: state }, permissions.payments),
    timeChange: orderTimeChange(row, state),
    topUpPayment: balance.debtMinor > 0 && permissions.payments ? state.topUpPayment : undefined,
    topUp: balance.debtMinor > 0 && permissions.payments ? state.topUp : undefined,
    packed: state.packed ?? [],
    handedOff: state.handedOff ?? false,
    readyForPickup: state.readyForPickup ?? false,
    deliveryAssigned: finance.deliveryAssigned ?? false,
    timeZone,
    permissions,
    events,
    balance,
    receipts,
    ...(permissions.payments && {
      refund: openOrderRefund(finance, number, snapshot.totalMinor, row.status),
      availableRefundMinor: availableOrderRefund(row, saved, finance),
      returnedMinor: finance.returnedMinor || undefined,
    }),
  };
}
