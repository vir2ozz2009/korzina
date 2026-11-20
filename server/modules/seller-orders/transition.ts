import type { OrderStage } from "../../../src/shared/contracts/buyer-order";
import type { ReceivingMethod } from "../../../src/shared/contracts/receiving-time";
import type { SellerTransition } from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";

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
