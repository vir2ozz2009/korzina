import type { TopUpConfirmation } from "../../../src/shared/contracts/order-refund";
import type { SellerOrderCommand } from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";
import type { OrderFinance } from "./order-refund";
import { addOrderPayment, type OrderWorkflow } from "./order-workflow";

export const defaultTopUp = (number: number): TopUpConfirmation => ({ id: `top-up:${number}` });

export function archiveProof(storage: DurableObjectStorage, number: number, proof?: string) {
  if (proof)
    storage.sql.exec(
      "INSERT INTO order_receipt_history(order_number,media_id,created_at) VALUES(?,?,?)",
      number,
      proof,
      Date.now(),
    );
}

type Review = Extract<SellerOrderCommand, { action: "confirmTransfer" | "rejectProof" }>;
export function reviewTopUp(
  storage: DurableObjectStorage,
  number: number,
  work: OrderWorkflow,
  finance: OrderFinance,
  input: Review,
) {
  const proof = work.topUp;
  if (proof?.status !== "pending_review" || proof.id !== input.obligationId || proof.proof !== input.proof)
    throw new ApiError("VERSION_CONFLICT", "Чек уже изменился. Проверьте заказ.");
  if (input.action === "rejectProof") {
    work.topUp = { ...proof, status: "rejected", reason: input.reason };
    return finance;
  }
  archiveProof(storage, number, proof.proof);
  work.topUp = { id: proof.id };
  return addOrderPayment(finance, { method: "transfer", amountMinor: input.amountMinor });
}

export function closeTopUp(storage: DurableObjectStorage, number: number, work: OrderWorkflow) {
  archiveProof(storage, number, work.topUp?.proof);
  delete work.topUp;
  delete work.topUpPayment;
}
