import { z } from "zod";
import type { Cart } from "./cart";
import type { OrderResult } from "./checkout";
import type { TimeChoice } from "./receiving-time";

export const orderNumberInput = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const historyInput = z.object({
  tab: z.enum(["active", "completed"]).default("active"),
  cursor: z.string().max(100).optional(),
});
export const orderChangeInput = z.strictObject({ expectedVersion: z.number().int().nonnegative() });
export const replaceProofInput = orderChangeInput.extend({ proofMediaId: z.uuid() });
export const repeatOrderInput = z.strictObject({
  expectedCartRevision: z.number().int().nonnegative(),
  check: z.string().max(12_000),
});

export type OrderStage = "placed" | "accepted" | "handed" | "ready" | "completed" | "cancelled";
export type PaymentState = "unpaid" | "pending_review" | "confirmed" | "rejected";
export type OrderSummary = {
  number: number;
  createdAt: number;
  stage: OrderStage;
  time: TimeChoice | null;
  method?: "delivery" | "pickup";
  totalMinor: number;
  currency: string;
};
export type BuyerOrder = Omit<OrderResult, "paymentStatus"> &
  OrderSummary & {
    version: number;
    paymentStatus: PaymentState;
    canCancel: boolean;
    canReplaceProof: boolean;
    refundMinor?: number;
    debtMinor?: number;
  };
export type ActiveOrders =
  | {
      rev: string;
      data: {
        orders: (Pick<OrderSummary, "number" | "stage" | "time" | "method"> & {
          debtMinor?: number;
          currency?: string;
        })[];
        count: number;
      };
    }
  | { rev: string; unchanged: true };
export type BuyerOrdersPage = { orders: OrderSummary[]; cursor?: string };
type RepeatLine = {
  variantId: string;
  name: string;
  unit: string;
  requested: number;
  quantity: number;
  previousMinor: number;
  priceMinor: number | null;
};
export type RepeatPreview = { lines: RepeatLine[]; check: string; expectedCartRevision: number };
export type RepeatResult = { cart: Cart; lines: RepeatLine[] };
