import type { OrderSnapshot } from "../../../src/shared/contracts/checkout";
import type { SalesRefund, SalesRefundAllocation } from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";
import { allocateMinor } from "../../../src/shared/money";

/** Amounts allocated to the current sale. Refunds for a prior price reduction and excess payments stay in money operations. */
export type RevenueSnapshot = Pick<OrderSnapshot, "currency" | "lines" | "itemsMinor" | "deliveryMinor"> & {
  fulfillment?:
    | Pick<Extract<OrderSnapshot["fulfillment"], { mode: "delivery" }>, "mode" | "payee">
    | { mode: "pickup" };
};

export function orderRevenue(order: RevenueSnapshot, refund?: SalesRefund) {
  const delivery =
    order.fulfillment?.mode === "delivery" && order.fulfillment.payee === "shop" ? order.deliveryMinor : 0;
  const weights = order.lines.map(({ totalMinor }) => totalMinor);
  const subtotal = weights.reduce((sum, amount) => sum + amount, 0);
  const discounted = allocateMinor(Math.min(subtotal, order.itemsMinor), weights);
  const specific = new Map(Object.entries(refund?.variants ?? {}));
  const afterSpecific = order.lines.map((line, index) => {
    const left = specific.get(line.variantId) ?? 0;
    const deduction = Math.min(discounted[index], left);
    specific.set(line.variantId, left - deduction);
    return discounted[index] - deduction;
  });
  const itemBalance = afterSpecific.reduce((sum, amount) => sum + amount, 0);
  const discount = allocateMinor(Math.min(itemBalance, refund?.itemsMinor ?? 0), afterSpecific);
  const lines = order.lines.map((line, i) => ({ ...line, revenueMinor: afterSpecific[i] - discount[i] }));
  const deliveryMinor = Math.max(0, delivery - (refund?.deliveryMinor ?? 0));
  const revenueMinor = lines.reduce((sum, line) => sum + line.revenueMinor, 0) + deliveryMinor;
  return { revenueMinor, deliveryMinor, lines };
}

export function allocateSalesRefund(
  order: RevenueSnapshot,
  old: SalesRefund | undefined,
  allocation: SalesRefundAllocation,
): SalesRefund {
  const current = old ?? { itemsMinor: 0, deliveryMinor: 0 };
  const remaining = orderRevenue(order, current);
  const { amountMinor } = allocation;
  if (allocation.kind === "delivery") {
    if (amountMinor <= remaining.deliveryMinor)
      return { ...current, deliveryMinor: current.deliveryMinor + amountMinor };
  } else {
    const weights = new Map<string, number>();
    for (const line of remaining.lines) {
      if (allocation.kind === "variant" && line.variantId !== allocation.variantId) continue;
      weights.set(line.variantId, (weights.get(line.variantId) ?? 0) + line.revenueMinor);
    }
    const entries = [...weights];
    if (amountMinor <= entries.reduce((sum, [, amount]) => sum + amount, 0)) {
      const parts = allocateMinor(
        amountMinor,
        entries.map(([, amount]) => amount),
      );
      const variants = new Map(Object.entries(current.variants ?? {}));
      for (const [index, [id]] of entries.entries()) variants.set(id, (variants.get(id) ?? 0) + parts[index]);
      return { ...current, variants: Object.fromEntries(variants) };
    }
  }
  throw new ApiError("VALIDATION", "Возврат превышает оплаченную стоимость");
}
