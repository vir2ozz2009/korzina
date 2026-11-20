import type { OrderStage } from "../../../../shared/contracts/buyer-order";
import type { SellerOrderCommand } from "../../../../shared/contracts/seller-order";

export type Handoff = "handOver" | "markPickedUp" | "complete";
export type OrderAction = SellerOrderCommand["action"];
export function mainAction(stage: OrderStage, delivery: boolean) {
  switch (stage) {
    case "placed":
      return { action: "accept", label: "Принять" } as const;
    case "accepted":
      return { action: "markReady", label: "Сборка завершена" } as const;
    case "ready":
      return delivery
        ? ({ action: "handOver", label: "Передать курьеру" } as const)
        : ({ action: "markPickedUp", label: "Выдать заказ" } as const);
    case "handed":
      return { action: "complete", label: "Доставлен" } as const;
    default:
      return undefined;
  }
}

export function rollbackStage(stage: OrderStage, delivery: boolean): OrderStage | undefined {
  switch (stage) {
    case "accepted":
      return "placed";
    case "ready":
      return "accepted";
    case "handed":
      return "ready";
    case "completed":
      return delivery ? "handed" : "ready";
    default:
      return undefined;
  }
}
export function isHandoff(action: OrderAction): action is Handoff {
  return action === "handOver" || action === "markPickedUp" || action === "complete";
}
