import { z } from "zod";
import type { OrderStage, PaymentState } from "./buyer-order";
import type { OrderResult } from "./checkout";
import type { CompositionSummary, TimeChange } from "./order-changes";
import { workdayFocus } from "./workday";

const revision = z.number().int().nonnegative();
const note = z.string().trim().min(1).max(500);
const stageCommand = z.strictObject({ expectedRevision: revision });
const amount = z.number().int().nonnegative().max(1_000_000_000_000);
const positiveAmount = amount.positive();
const method = z.enum(["cash", "transfer"]);
const paymentInput = z.strictObject({ method, amountMinor: positiveAmount });
const choice = z.union([paymentInput, z.strictObject({ method: z.literal("debt") })]);
const sellerTransitionInput = z.discriminatedUnion("action", [
  stageCommand.extend({ action: z.literal("accept") }),
  stageCommand.extend({ action: z.literal("markReady"), confirmIncomplete: z.boolean().optional() }),
  stageCommand.extend({ action: z.enum(["handOver", "markPickedUp", "complete"]), payment: choice.optional() }),
  stageCommand.extend({ action: z.literal("rollback"), reason: note }),
  stageCommand.extend({ action: z.literal("cancel"), reason: note, returnStock: z.boolean().optional() }),
]);

export type SellerTransition = z.infer<typeof sellerTransitionInput>;
export type SellerOrderEvent = {
  id: number;
  actor: string;
  event: string;
  createdAt: number;
  reason: string | null;
  details: string | null;
};
export type SellerOrder = Omit<OrderResult, "paymentStatus"> & {
  composition?: CompositionSummary;
  timeChange?: TimeChange;
  topUpPayment?: OrderResult["paymentOption"];
  createdAt: number;
  stage: OrderStage;
  revision: number;
  paymentStatus: PaymentState;
  packed: string[];
  handedOff: boolean;
  readyForPickup: boolean;
  deliveryAssigned: boolean;
  timeZone: string;
  events: SellerOrderEvent[];
  receipts: ReceiptRef[];
  balance: SellerBalance;
  permissions: { assembly: boolean; payments: boolean; chat?: boolean };
};

const receiptId = z.uuid();
export const sellerOrderCommand = z.discriminatedUnion("action", [
  ...sellerTransitionInput.options,
  stageCommand.extend({ action: z.literal("setLinePacked"), line: z.string().min(1).max(200), packed: z.boolean() }),
  stageCommand.extend({ action: z.literal("setAllPacked"), packed: z.boolean() }),
  stageCommand.extend({ action: z.literal("recordPayment"), ...paymentInput.shape }),
  stageCommand.extend({ action: z.literal("correctPayment"), ...paymentInput.shape }),
  stageCommand.extend({ action: z.literal("confirmTransfer"), proof: receiptId, amountMinor: positiveAmount }),
  stageCommand.extend({ action: z.literal("rejectProof"), proof: receiptId, reason: note }),
  stageCommand.extend({ action: z.literal("waiveDue"), reason: note }),
  stageCommand.extend({
    action: z.literal("markRefundReturned"),
    allocation: z
      .discriminatedUnion("kind", [
        z.strictObject({ kind: z.enum(["items", "delivery"]), amountMinor: positiveAmount }),
        z.strictObject({
          kind: z.literal("variant"),
          variantId: z.string().min(1).max(128),
          amountMinor: positiveAmount,
        }),
      ])
      .optional(),
  }),
  stageCommand.extend({ action: z.literal("setDeliveryFee"), amountMinor: amount }),
]);
export type SellerOrderCommand = z.infer<typeof sellerOrderCommand>;
export type SalesRefundAllocation = NonNullable<
  Extract<SellerOrderCommand, { action: "markRefundReturned" }>["allocation"]
>;
export type SalesRefund = { itemsMinor: number; deliveryMinor: number; variants?: Record<string, number> };
export type PaymentMethod = z.infer<typeof method>;
export type RecordedPayment = { method: PaymentMethod; amountMinor: number };
type SellerBalance = {
  paidMinor: number;
  outstandingMinor: number;
  debtMinor: number;
  refundMinor: number;
  latestPayment?: RecordedPayment;
  receiptReason?: string;
};
export type ReceiptRef = { id: string; createdAt: number; mime: string };

export const sellerOrdersQuery = z
  .object({
    tab: z.enum(["active", "completed"]).default("active"),
    method: z.enum(["delivery", "pickup"]).optional(),
    day: z.iso.date().optional(),
    focus: workdayFocus.optional(),
    completedFrom: z.iso.date().optional(),
    completedTo: z.iso.date().optional(),
    debt: z.literal("1").optional(),
    search: z.string().trim().max(80).optional(),
    cursor: z.string().max(500).optional(),
    rev: z.coerce.number().int().nonnegative().optional(),
    cachedMoney: z.enum(["0", "1"]).optional(),
  })
  .refine(
    ({ completedFrom, completedTo }) =>
      (!completedFrom && !completedTo) || (!!completedFrom && !!completedTo && completedFrom <= completedTo),
    "Укажите период выполнения",
  );
export type SellerOrdersQuery = z.infer<typeof sellerOrdersQuery>;
export type SellerOrderSummary = {
  number: number;
  stage: OrderStage;
  revision: number;
  method: "delivery" | "pickup";
  receivingAt: string;
  completedAt?: number;
  createdAt: number;
  name: string | null;
  currency?: string;
  totalMinor?: number;
  paymentStatus: PaymentState;
  packed: number;
  lines: number;
  debtMinor?: number;
  refundMinor?: number;
};
export type SellerOrderPage = {
  rev: number;
  money: boolean;
  timeZone: string;
  orders: SellerOrderSummary[];
  active: number;
  newlyPlaced: number;
  counts: Partial<Record<OrderStage, number>>;
  cursor?: string;
};
