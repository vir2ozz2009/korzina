import type { OrderStage } from "../../../src/shared/contracts/buyer-order";
import type { ReceivingMethod } from "../../../src/shared/contracts/receiving-time";
import type { SellerTransition } from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";
import type { Seller } from "../../auth/roles";
import type { CommandIdentity } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { unpackOrder } from "../checkout/buyer-orders";
import { releaseOrderReservation } from "../checkout/order-reservation";
import { fulfillmentState, sellerOrder, sellerOrderRow } from "./order";

const previous = {
  delivery: { accepted: "placed", ready: "accepted", handed: "ready", completed: "handed" },
  pickup: { accepted: "placed", ready: "accepted", completed: "ready" },
} satisfies Record<ReceivingMethod, Partial<Record<OrderStage, OrderStage>>>;

export function nextOrderStage(
  stage: OrderStage,
  method: ReceivingMethod,
  action: SellerTransition["action"],
): OrderStage {
  if (action === "accept" && stage === "placed") return "accepted";
  if (action === "markReady" && stage === "accepted") return "ready";
  if (action === "handOver" && stage === "ready" && method === "delivery") return "handed";
  if (action === "markPickedUp" && stage === "ready" && method === "pickup") return "completed";
  if (action === "complete" && stage === "handed" && method === "delivery") return "completed";
  if (action === "cancel" && stage !== "cancelled") return "cancelled";
  if (action === "rollback") {
    const stages: Partial<Record<OrderStage, OrderStage>> = previous[method];
    if (stages[stage]) return stages[stage];
  }
  throw new ApiError("INVALID_TRANSITION", "Действие больше недоступно");
}

export function transitionOrder(
  env: ShopEnv["Bindings"],
  actor: Seller,
  number: number,
  input: SellerTransition,
  identity: CommandIdentity,
) {
  const { storage } = env;
  return executeCommand(storage, env.db, `seller-order:${actor.accountId}:${number}`, identity, () => {
    const row = sellerOrderRow(storage, number);
    if (row.version !== input.expectedRevision)
      throw new ApiError("VERSION_CONFLICT", "Заказ изменился. Проверьте новый статус.");
    const snapshot = unpackOrder(row);
    const old = fulfillmentState(row);
    const method = snapshot.receiving.mode;
    const next = nextOrderStage(row.status, method, input.action);
    if (input.action === "markReady" && (old.packed?.length ?? 0) < snapshot.lines.length && !input.confirmIncomplete)
      throw new ApiError("VALIDATION", "Подтвердите завершение неполной сборки");
    if (input.action === "cancel") {
      const late = old.handedOff || (method === "pickup" && row.status === "ready");
      if (late && input.returnStock === undefined) throw new ApiError("VALIDATION", "Выберите, вернуть ли товар");
      releaseOrderReservation(storage, snapshot, !late || input.returnStock === true);
    }
    const state = { ...old, handedOff: old.handedOff || next === "handed" || next === "completed" };
    storage.sql.exec(
      "UPDATE orders SET status=?,version=version+1,fulfillment_state=? WHERE number=?",
      next,
      JSON.stringify(state),
      number,
    );
    storage.sql.exec(
      "INSERT INTO buyer_order_events(order_number,actor,event,created_at,reason,details) VALUES(?,?,?,?,?,?)",
      number,
      actor.accountId,
      `order.${input.action}`,
      Date.now(),
      "reason" in input ? input.reason : null,
      JSON.stringify({ from: row.status, to: next }),
    );
    return { status: 200, body: sellerOrder(storage, number, actor) };
  }).body;
}
