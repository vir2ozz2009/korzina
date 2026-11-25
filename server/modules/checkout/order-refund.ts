import type { OrderStage } from "../../../src/shared/contracts/buyer-order";
import type { OrderRefund } from "../../../src/shared/contracts/order-refund";
import type { OrderWorkflow } from "./order-workflow";
import { orderBalance } from "./order-workflow";

export type OrderFinance = NonNullable<OrderWorkflow["finance"]>;
export function openOrderRefund(
  finance: OrderFinance,
  number: number,
  totalMinor: number,
  stage: OrderStage,
): OrderRefund | undefined {
  const { refundMinor } = orderBalance(finance, totalMinor, stage);
  if (!refundMinor) return;
  return {
    id: finance.refund?.id ?? `automatic:${number}:${finance.returnedMinor}`,
    amountMinor: refundMinor,
    needsAllocation: finance.refund?.remainingMinor !== undefined,
    details: finance.refund?.details,
  };
}
