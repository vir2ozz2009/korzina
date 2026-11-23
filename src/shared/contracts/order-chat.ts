import { z } from "zod";
import type { OrderStage } from "./buyer-order";
import type { ChangeSide } from "./order-changes";

const position = z.coerce.number().int().positive();
export const chatHistoryInput = z.object({ before: position.optional(), after: position.optional() });
export const chatListInput = z.object({
  cursor: z
    .string()
    .regex(/^\d\.\d+\.\d+$/u)
    .max(70)
    .optional(),
});
export const chatReadInput = z.strictObject({ through: z.number().int().positive() });
export const chatSendInput = z.strictObject({
  text: z.string().trim().max(8192).optional(),
  mediaId: z.uuid().optional(),
});
export type ChatSend = z.infer<typeof chatSendInput>;

export type OrderChatEntry = {
  id: number;
  createdAt: number;
  side: ChangeSide | "system";
} & ({ kind: "message"; text?: string; mediaId?: string } | { kind: "event"; event: string; pending?: boolean });
export type OrderChatHistory = {
  entries: OrderChatEntry[];
  cursor?: number;
  writable: boolean;
  balance?: { amountMinor: number; currency: string; kind: "topUp" | "refund" };
};
type OrderChatSummary = {
  number: number;
  stage: OrderStage;
  lastAt: number;
  preview: string;
  unread: number;
  waiting: boolean;
};
export type OrderChatList = { chats: OrderChatSummary[]; cursor?: string };
