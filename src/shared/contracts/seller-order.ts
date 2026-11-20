import { z } from "zod";
import type { OrderStage, PaymentState } from "./buyer-order";
import type { OrderResult } from "./checkout";

const revision = z.number().int().nonnegative();
const note = z.string().trim().min(1).max(500);
const stageCommand = z.strictObject({ expectedRevision: revision });
export const sellerTransitionInput = z.discriminatedUnion("action", [
  stageCommand.extend({ action: z.literal("accept") }),
  stageCommand.extend({ action: z.literal("markReady"), confirmIncomplete: z.boolean().optional() }),
  stageCommand.extend({ action: z.enum(["handOver", "markPickedUp", "complete"]) }),
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
  createdAt: number;
  stage: OrderStage;
  revision: number;
  paymentStatus: PaymentState;
  packed: string[];
  handedOff: boolean;
  events: SellerOrderEvent[];
  permissions: { assembly: boolean; payments: boolean };
};
