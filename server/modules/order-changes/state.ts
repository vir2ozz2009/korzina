import type { CompositionChange, CompositionTotals } from "../../../src/shared/contracts/order-changes";
import { ApiError } from "../../../src/shared/errors";
import { type OrderRow, unpackOrder } from "../checkout/buyer-orders";
import type { ReservedOrder } from "../checkout/order-reservation";
import { type OrderWorkflow, orderBalance, orderFinance, orderWorkflow } from "../checkout/order-workflow";

export type ChangeState = { row: OrderRow; snapshot: ReservedOrder; work: OrderWorkflow };

export function pendingComposition(change?: CompositionChange) {
  return change?.lines.some((line) => line.status === "pending") ?? false;
}

export function hasPendingOrderChange(work: OrderWorkflow) {
  return pendingComposition(work.composition) || work.timeChange?.status === "pending";
}

export function orderTimeChange(row: Pick<OrderRow, "status">, work: OrderWorkflow) {
  const change = work.timeChange;
  if (change?.status !== "pending" || canChangeOrder(row, work)) return change;
  return { ...change, status: "closed" as const };
}

export function canChangeOrder(row: Pick<OrderRow, "status">, work: OrderWorkflow) {
  return !work.handedOff && row.status !== "cancelled" && row.status !== "completed" && row.status !== "handed";
}

export function requireChangeable({ row, work }: ChangeState, expected: number) {
  if (!canChangeOrder(row, work)) throw new ApiError("ORDER_CLOSED", "Изменение заказа недоступно");
  if (row.version !== expected) throw new ApiError("VERSION_CONFLICT", "Заказ изменился. Обновите карточку.");
}

export function compositionTotals(
  { row, snapshot, work }: ChangeState,
  originalMinor: number,
  currentMinor: number,
  money: boolean,
): CompositionTotals {
  const totals = {
    originalMinor,
    currentMinor: row.status === "cancelled" ? 0 : currentMinor,
    currency: snapshot.currency,
  };
  if (!money) return totals;
  const finance = orderFinance(work, snapshot, row.payment_status);
  const { outstandingMinor, refundMinor } = orderBalance(finance, currentMinor, row.status);
  const paidMinor = finance.paidMinor - finance.returnedMinor;
  return {
    ...totals,
    paidMinor,
    refundMinor,
    topUpMinor: paidMinor > 0 ? outstandingMinor : 0,
  };
}

export function orderComposition(state: ChangeState, money = true) {
  const { row, snapshot, work } = state;
  if (!work.composition) return;
  const change = canChangeOrder(row, work) ? work.composition : closeComposition(work.composition);
  return { ...change, totals: compositionTotals(state, change.originalMinor, snapshot.totalMinor, money) };
}

function closeComposition(change: CompositionChange): CompositionChange {
  return {
    ...change,
    expiresAt: null,
    lines: change.lines.map((line) => (line.status === "pending" ? { ...line, status: "closed" } : line)),
  };
}

export function readChangeState(row: OrderRow): ChangeState {
  return { row, snapshot: unpackOrder(row), work: orderWorkflow(row) };
}
