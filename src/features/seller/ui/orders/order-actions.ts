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

export function zonedDay(date: number, timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, dateStyle: "short" }).format(date);
}

export function dayLabel(day: string, timeZone: string) {
  const today = zonedDay(Date.now(), timeZone);
  if (day === today) return "Сегодня";
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (day === tomorrow.toISOString().slice(0, 10)) return "Завтра";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "long" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}
