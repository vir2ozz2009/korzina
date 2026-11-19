import { z } from "zod";
import type { CartAdjustment, CartLine } from "./cart";
import type { Receiving, ReceivingAvailability } from "./receiving";
import type { TimeChoice } from "./receiving-time";

const methodInput = z.enum(["cash", "transfer"]);
export const paymentSettingsInput = z.object({
  minimumMinor: z.number().int().nonnegative(),
  methods: z.array(methodInput).max(2),
  instruction: z.string().trim().max(2000).optional(),
  qrSrc: z.union([z.url({ protocol: /^https$/u }), z.string().regex(/^\/demo\/[a-z0-9-]+\.png$/u)]).optional(),
});
export const shopContactsInput = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(80),
      href: z
        .string()
        .url()
        .refine((value) => ["https:", "tel:", "mailto:"].includes(new URL(value).protocol)),
    }),
  )
  .max(8);
export const checkoutInput = z.discriminatedUnion("payment", [
  z.strictObject({ quoteRevision: z.uuid(), payment: z.literal("cash") }),
  z.strictObject({ quoteRevision: z.uuid(), payment: z.literal("transfer"), proofMediaId: z.uuid() }),
]);
export const receiptQuoteInput = z.strictObject({ quoteRevision: z.uuid(), proofMediaId: z.uuid() });
export type CheckoutCommand = z.infer<typeof checkoutInput>;
export type PaymentSettings = z.infer<typeof paymentSettingsInput>;
type PurchaseLine = Pick<CartLine, "variantId" | "productId" | "name" | "unit" | "quantity" | "priceMinor"> & {
  totalMinor: number;
};
export type PurchaseQuote = {
  revision: number;
  currency: string;
  lines: PurchaseLine[];
  adjustments?: CartAdjustment[];
  itemsMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  receiving: Receiving;
  fulfillment: Extract<ReceivingAvailability, { available: true }>;
  time: TimeChoice | null;
  phone: string | null;
  telegramLinked: boolean;
  paymentSettings: PaymentSettings;
};

export type QuoteResponse = PurchaseQuote & { quoteRevision: string; expiresAt: number };
export type OrderSnapshot = Omit<PurchaseQuote, "paymentSettings"> & {
  payment: CheckoutCommand["payment"];
  paymentStatus: "unpaid" | "pending_review";
  transferReview?: { priorTotalMinor: number; differenceMinor: number; credentialsChanged: boolean };
};
export type OrderResult = OrderSnapshot & { number: number };
