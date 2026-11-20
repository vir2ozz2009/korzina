import type { SellerOrder, SellerOrderEvent } from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";
import type { Seller } from "../../auth/roles";
import { type OrderRow, unpackOrder } from "../checkout/buyer-orders";

type FulfillmentState = { packed?: string[]; handedOff?: boolean };
export function sellerOrderRow(storage: DurableObjectStorage, number: number) {
  const row = storage.sql
    .exec<OrderRow>(
      "SELECT number,created_at,status,payment_status,version,proof_media_id,snapshot,fulfillment_state FROM orders WHERE number=?",
      number,
    )
    .toArray()[0];
  if (!row) throw new ApiError("NOT_FOUND", "Заказ недоступен");
  return row;
}

export function fulfillmentState(row: OrderRow): FulfillmentState {
  return {
    ...JSON.parse(row.fulfillment_state),
    ...((row.status === "handed" || row.status === "completed") && { handedOff: true }),
  };
}

export function sellerOrder(storage: DurableObjectStorage, number: number, actor: Seller): SellerOrder {
  const row = sellerOrderRow(storage, number);
  const { seatReserved: _seat, reservedStock: _stock, ...snapshot } = unpackOrder(row);
  const state = fulfillmentState(row);
  const permissions = {
    assembly: actor.role === "owner" || actor.permissions.includes("assembly"),
    payments: actor.role === "owner" || actor.permissions.includes("payments"),
  };
  const events = storage.sql
    .exec<SellerOrderEvent>(
      "SELECT id,actor,event,created_at AS createdAt,reason,details FROM buyer_order_events WHERE order_number=? ORDER BY id DESC LIMIT 100",
      number,
    )
    .toArray();
  return {
    ...snapshot,
    number,
    stage: row.status,
    revision: row.version,
    createdAt: row.created_at,
    paymentStatus: row.payment_status,
    packed: state.packed ?? [],
    handedOff: state.handedOff ?? false,
    permissions,
    events,
  };
}
