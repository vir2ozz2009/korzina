import { z } from "zod";

export const refundIdInput = z.string().min(1).max(100);
export const refundAmountInput = z.int().positive().max(1_000_000_000_000);
export const refundAllocationInput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.enum(["items", "delivery", "overpayment"]), amountMinor: refundAmountInput }),
  z.strictObject({ kind: z.literal("variant"), variantId: z.string().min(1).max(128), amountMinor: refundAmountInput }),
]);

export const submitRefundDetails = z
  .strictObject({
    expectedVersion: z.int().nonnegative(),
    refundId: refundIdInput,
    text: z.string().trim().min(1).max(500).optional(),
    mediaId: z.uuid().optional(),
  })
  .refine(({ text, mediaId }) => !!text !== !!mediaId, "Введите реквизиты или добавьте фото QR");

export type RefundDetails = { text?: string; mediaId?: string };
export type OrderRefund = {
  id: string;
  amountMinor: number;
  needsAllocation: boolean;
  details?: RefundDetails;
};

export type RefundSummary = {
  refund?: OrderRefund;
  returnedMinor?: number;
};

export type TopUpConfirmation = { id: string; proof?: string; status?: "pending_review" | "rejected"; reason?: string };
