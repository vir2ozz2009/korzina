import type { SellerOrderCommand } from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";
import { addMinor } from "../../../src/shared/money";
import type { OrderRow } from "../checkout/buyer-orders";
import { type OrderFinance, openOrderRefund } from "../checkout/order-refund";
import type { ReservedOrder } from "../checkout/order-reservation";
import { allocateSalesRefund, orderRevenue } from "../seller-sales/revenue";

type RecordRefund = Extract<SellerOrderCommand, { action: "markRefundReturned" }>;

export function availableOrderRefund(row: OrderRow, snapshot: ReservedOrder, finance: OrderFinance) {
  if (row.status !== "completed") return 0;
  return openOrderRefund(finance, row.number, snapshot.totalMinor, row.status)
    ? 0
    : finance.paidMinor - finance.returnedMinor;
}

export function openSellerRefund(row: OrderRow, snapshot: ReservedOrder, finance: OrderFinance, amountMinor: number) {
  if (row.status !== "completed") throw new ApiError("INVALID_TRANSITION", "Возврат доступен для выполненного заказа");
  if (openOrderRefund(finance, row.number, snapshot.totalMinor, row.status))
    throw new ApiError("INVALID_TRANSITION", "Возврат уже открыт");
  const available = availableOrderRefund(row, snapshot, finance);
  if (amountMinor > available) throw new ApiError("VALIDATION", "Возврат превышает доступную сумму", { available });
  return { ...finance, refund: { id: crypto.randomUUID(), remainingMinor: amountMinor } };
}

export function returnSellerRefund(row: OrderRow, snapshot: ReservedOrder, finance: OrderFinance, input: RecordRefund) {
  const refund = openOrderRefund(finance, row.number, snapshot.totalMinor, row.status);
  if (!refund || (input.refundId && input.refundId !== refund.id))
    throw new ApiError("INVALID_TRANSITION", "Задача уже закрыта");
  const amountMinor = input.amountMinor ?? input.allocation?.amountMinor ?? refund.amountMinor;
  if (amountMinor > refund.amountMinor || amountMinor > finance.paidMinor - finance.returnedMinor)
    throw new ApiError("VALIDATION", "Возврат превышает доступную сумму", { available: refund.amountMinor });
  if (input.refundId && !input.comment) throw new ApiError("VALIDATION", "Укажите комментарий");
  const received = finance.paidMinor - finance.returnedMinor;
  const revenue = orderRevenue(snapshot, finance.salesRefund);
  const overpayment = Math.max(0, received - revenue.revenueMinor);
  const allocations = input.allocations ?? (input.allocation ? [input.allocation] : undefined);
  let salesRefund = finance.salesRefund;
  if (refund.needsAllocation) {
    let split = allocations;
    if (!split) {
      const items = revenue.revenueMinor - revenue.deliveryMinor;
      const sources = [
        { kind: "items", amount: items },
        { kind: "delivery", amount: revenue.deliveryMinor },
        { kind: "overpayment", amount: overpayment },
      ].filter(({ amount }) => amount > 0);
      if (sources.length !== 1) throw new ApiError("VALIDATION", "Укажите, за что возврат");
      const [source] = sources;
      if (source.kind === "items" || source.kind === "delivery" || source.kind === "overpayment")
        split = [{ kind: source.kind, amountMinor }];
    }
    if (!split || addMinor(...split.map((part) => part.amountMinor)) !== amountMinor)
      throw new ApiError("VALIDATION", "Суммы в разбивке должны совпасть с суммой возврата");
    let paidExtra = 0;
    for (const part of split) {
      if (part.kind === "overpayment") paidExtra = addMinor(paidExtra, part.amountMinor);
      else if (part.kind === "variant")
        salesRefund = allocateSalesRefund(snapshot, salesRefund, { ...part, kind: "variant" });
      else salesRefund = allocateSalesRefund(snapshot, salesRefund, { ...part, kind: part.kind });
    }
    if (paidExtra > overpayment) throw new ApiError("VALIDATION", "Возврат превышает переплату");
  } else if (allocations) {
    // The current snapshot already includes the price reduction that triggered this return.
    throw new ApiError("VALIDATION", "Для этого возврата назначение уже определено");
  }
  const remainingMinor = refund.amountMinor - amountMinor;
  return {
    finance: {
      ...finance,
      salesRefund,
      returnedMinor: addMinor(finance.returnedMinor, amountMinor),
      refund: remainingMinor
        ? { ...finance.refund, id: refund.id, remainingMinor: refund.needsAllocation ? remainingMinor : undefined }
        : undefined,
    },
    details: { amountMinor, allocations, comment: input.comment },
  };
}
