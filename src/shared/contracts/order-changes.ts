import { z } from "zod";
import type { OrderSnapshot } from "./checkout";
import { selectionInput, type TimeChoice } from "./receiving-time";

const lineId = z.string().min(1).max(120);
const quantity = z.number().int().min(1).max(999);
export const compositionEdits = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  edits: z
    .array(
      z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("unavailable"), lineId, quantity: quantity.or(z.literal(0)) }),
        z.strictObject({ kind: z.literal("replace"), lineId, variantId: lineId, quantity }),
        z.strictObject({ kind: z.literal("add"), variantId: lineId, quantity }),
      ]),
    )
    .min(1)
    .max(100),
});
export const compositionProposal = compositionEdits.extend({ quote: z.string().max(32_000) });
export const compositionAnswer = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  changeId: z.uuid(),
  lineId,
  decision: z.enum(["accept", "decline"]),
  confirmedLineMinor: z.number().int().nonnegative().optional(),
});
export type CompositionEdits = z.infer<typeof compositionEdits>;
export type CompositionAnswer = z.infer<typeof compositionAnswer>;
export type OrderLine = OrderSnapshot["lines"][number];
export const orderLineKey = (line: OrderLine) => line.lineId ?? line.variantId;

export type CompositionLine = {
  id: string;
  kind: "remove" | "decrease" | "replace" | "add";
  status: "pending" | "applied" | "accepted" | "declined" | "expired" | "closed";
  before: OrderLine | null;
  after: OrderLine | null;
  deltaMinor: number;
};
export type CompositionChange = {
  id: string;
  createdAt: number;
  expiresAt: number | null;
  originalMinor: number;
  lines: CompositionLine[];
};
export type CompositionTotals = {
  originalMinor: number;
  currentMinor: number;
  paidMinor?: number;
  refundMinor?: number;
  topUpMinor?: number;
  currency: string;
};
export type CompositionSummary = CompositionChange & { totals: CompositionTotals };
export type CompositionQuote = {
  lines: CompositionLine[];
  totals: CompositionTotals;
  quote: string;
};

export const timeChangeInput = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("propose"),
    expectedVersion: z.number().int().nonnegative(),
    time: selectionInput,
  }),
  z.strictObject({
    action: z.literal("counter"),
    expectedVersion: z.number().int().nonnegative(),
    changeId: z.uuid(),
    time: selectionInput,
  }),
  z.strictObject({
    action: z.enum(["accept", "withdraw", "keep"]),
    expectedVersion: z.number().int().nonnegative(),
    changeId: z.uuid(),
  }),
]);
export type TimeChangeInput = z.infer<typeof timeChangeInput>;
export type ChangeSide = "buyer" | "seller";
export type TimeChange = {
  id: string;
  createdAt: number;
  by: ChangeSide;
  before: TimeChoice | null;
  proposed: TimeChoice;
  status: "pending" | "accepted" | "withdrawn" | "kept" | "superseded" | "closed";
};
