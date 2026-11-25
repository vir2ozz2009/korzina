import type { OrderStage, PaymentState } from "../../../src/shared/contracts/buyer-order";
import type { SellerOrderCommand, SellerTransition } from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";
import { addMinor, subtractMinor } from "../../../src/shared/money";
import type { OrderRow } from "../checkout/buyer-orders";
import type { ReservedOrder } from "../checkout/order-reservation";
import { addOrderPayment, type OrderWorkflow, orderBalance } from "../checkout/order-workflow";

import { openSellerRefund, returnSellerRefund } from "./refunds";

type Finance = NonNullable<OrderWorkflow["finance"]>;
type PaymentCommand = Exclude<SellerOrderCommand, SellerTransition | { action: "setLinePacked" | "setAllPacked" }>;

export function paymentForTransition(
  finance: Finance,
  snapshot: ReservedOrder,
  stage: OrderStage,
  input: SellerTransition,
) {
  if (input.action !== "handOver" && input.action !== "markPickedUp" && input.action !== "complete") return finance;
  const balance = orderBalance(finance, snapshot.totalMinor, stage);
  if (!balance.outstandingMinor) return finance;
  if (!input.payment) throw new ApiError("VALIDATION", "Укажите, как клиент заплатил");
  return input.payment.method === "debt" ? { ...finance, debtOpened: true } : addOrderPayment(finance, input.payment);
}

export function changePayment(row: OrderRow, snapshot: ReservedOrder, finance: Finance, input: PaymentCommand) {
  const balance = orderBalance(finance, snapshot.totalMinor, row.status);
  let changed = finance;
  let status: PaymentState = row.payment_status;
  let details: unknown;
  switch (input.action) {
    case "recordPayment":
      changed = addOrderPayment(finance, { method: input.method, amountMinor: input.amountMinor });
      break;
    case "confirmTransfer":
    case "rejectProof":
      if (row.status === "cancelled" || row.payment_status !== "pending_review" || row.proof_media_id !== input.proof)
        throw new ApiError("VERSION_CONFLICT", "Чек уже изменился. Проверьте заказ.");
      if (input.action === "confirmTransfer")
        changed = addOrderPayment(finance, { method: "transfer", amountMinor: input.amountMinor });
      else {
        changed = { ...finance, receiptReason: input.reason };
        status = "rejected";
      }
      break;
    case "correctPayment": {
      const previous = finance.latestPayment;
      if (!previous) throw new ApiError("VALIDATION", "Сначала запишите оплату");
      const latestPayment = { method: input.method, amountMinor: input.amountMinor };
      const paidMinor = addMinor(subtractMinor(finance.paidMinor, previous.amountMinor), input.amountMinor);
      if (paidMinor < finance.returnedMinor + (finance.refund?.remainingMinor ?? 0))
        throw new ApiError("VALIDATION", "Сумма меньше уже возвращённой или обещанной к возврату");
      changed = { ...finance, latestPayment, paidMinor, debtOpened: true };
      details = { previous, current: latestPayment };
      break;
    }
    case "waiveDue":
      if (!balance.debtMinor) throw new ApiError("VALIDATION", "Открытого долга нет");
      changed = { ...finance, waivedMinor: addMinor(finance.waivedMinor, balance.debtMinor) };
      break;
    case "openRefund":
      changed = openSellerRefund(row, snapshot, finance, input.amountMinor);
      details = { amountMinor: input.amountMinor };
      break;
    case "markRefundReturned":
      ({ finance: changed, details } = returnSellerRefund(row, snapshot, finance, input));
      break;
    case "setDeliveryFee": {
      const { fulfillment } = snapshot;
      if (
        row.status === "cancelled" ||
        fulfillment.mode !== "delivery" ||
        fulfillment.tariff !== "after_order" ||
        (finance.deliveryAssigned && balance.outstandingMinor === 0)
      )
        throw new ApiError("INVALID_TRANSITION", "Стоимость доставки уже зафиксирована");
      snapshot.fulfillment = { ...fulfillment, feeMinor: input.amountMinor };
      if (fulfillment.payee === "shop") {
        snapshot.deliveryMinor = input.amountMinor;
        snapshot.totalMinor = addMinor(snapshot.itemsMinor, input.amountMinor);
      }
      changed = {
        ...finance,
        deliveryAssigned: true,
        debtOpened: finance.debtOpened || balance.outstandingMinor === 0,
      };
      break;
    }
  }
  const after = orderBalance(changed, snapshot.totalMinor, row.status);
  if (
    input.action !== "rejectProof" &&
    input.action !== "openRefund" &&
    (input.action !== "setDeliveryFee" || status === "confirmed")
  ) {
    status = after.outstandingMinor === 0 || row.payment_status === "confirmed" ? "confirmed" : "unpaid";
  }
  return { finance: changed, status, details };
}
