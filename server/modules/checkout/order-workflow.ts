import type { OrderStage, PaymentState } from "../../../src/shared/contracts/buyer-order";
import type { OrderSnapshot } from "../../../src/shared/contracts/checkout";
import type { CompositionChange, TimeChange } from "../../../src/shared/contracts/order-changes";
import type { RecordedPayment, SalesRefund } from "../../../src/shared/contracts/seller-order";
import type { PaymentOption } from "../../../src/shared/contracts/seller-payments";
import { addMinor, subtractMinor } from "../../../src/shared/money";

export type OrderWorkflow = {
  composition?: CompositionChange;
  timeChange?: TimeChange;
  topUpPayment?: PaymentOption;
  packed?: string[];
  handedOff?: boolean;
  readyForPickup?: boolean;
  finance?: {
    paidMinor: number;
    latestPayment?: RecordedPayment;
    returnedMinor: number;
    salesRefund?: SalesRefund;
    waivedMinor: number;
    debtOpened: boolean;
    receiptReason?: string;
    deliveryAssigned?: boolean;
  };
  debtMinor?: number;
  refundMinor?: number;
};

export function orderWorkflow(row: { fulfillment_state: string; status: OrderStage }): OrderWorkflow {
  const saved = JSON.parse(row.fulfillment_state) as OrderWorkflow;
  return row.status === "handed" || row.status === "completed" ? { ...saved, handedOff: true } : saved;
}

export function orderFinance(work: OrderWorkflow, snapshot: OrderSnapshot, paymentStatus: PaymentState) {
  if (work.finance) return work.finance;
  const amountMinor = paymentStatus === "confirmed" ? snapshot.totalMinor : 0;
  return {
    paidMinor: amountMinor,
    latestPayment: amountMinor ? { method: snapshot.payment, amountMinor } : undefined,
    returnedMinor: 0,
    waivedMinor: 0,
    debtOpened: false,
  } satisfies NonNullable<OrderWorkflow["finance"]>;
}

export function orderBalance(finance: NonNullable<OrderWorkflow["finance"]>, totalMinor: number, stage: OrderStage) {
  const received = subtractMinor(finance.paidMinor, finance.returnedMinor);
  const refund = finance.salesRefund;
  const returnedFromSale = refund
    ? addMinor(refund.itemsMinor, refund.deliveryMinor, ...Object.values(refund.variants ?? {}))
    : 0;
  const cost = stage === "cancelled" ? 0 : subtractMinor(totalMinor, Math.min(totalMinor, returnedFromSale));
  const discounted = subtractMinor(cost, Math.min(cost, finance.waivedMinor));
  const outstandingMinor = subtractMinor(discounted, Math.min(discounted, received));
  const refundMinor = subtractMinor(received, Math.min(received, cost));
  return {
    paidMinor: finance.paidMinor,
    outstandingMinor,
    debtMinor: finance.debtOpened ? outstandingMinor : 0,
    refundMinor,
    latestPayment: finance.latestPayment,
    receiptReason: finance.receiptReason,
  };
}

export function addOrderPayment(finance: NonNullable<OrderWorkflow["finance"]>, payment: RecordedPayment) {
  return {
    ...finance,
    paidMinor: addMinor(finance.paidMinor, payment.amountMinor),
    latestPayment: payment,
    debtOpened: true,
    receiptReason: undefined,
  };
}
