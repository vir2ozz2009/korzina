import { z } from "zod";
import type { CatalogImage } from "./catalog";

const minor = z.number().int().min(1).max(1_000_000_000);
const count = z.number().int().min(1).max(1_000_000);
const id = z.string().min(1).max(120);
export const promoCode = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((value) => value.normalize("NFKC").toUpperCase())
  .pipe(z.string().regex(/^[\p{L}\p{N}_-]{1,40}$/u));
const promoKinds = ["automatic", "code"] as const;
export const promoStatuses = ["active", "scheduled", "draft", "ended", "disabled"] as const;
export const promoTerms = z.object({
  name: z.string().trim().max(120),
  kind: z.enum(promoKinds),
  code: promoCode.optional(),
  discount: z.discriminatedUnion("type", [
    z.object({ type: z.literal("percent"), value: z.number().int().min(0).max(10_000), capMinor: minor.optional() }),
    z.object({ type: z.literal("fixed"), value: minor.or(z.literal(0)) }),
  ]),
  scope: z.discriminatedUnion("type", [
    z.object({ type: z.literal("all") }),
    z.object({ type: z.enum(["variants", "products", "categories"]), ids: z.array(id).max(50) }),
  ]),
  minimumMinor: minor.optional(),
  minimumQuantity: count.optional(),
  confirmed: z.boolean(),
  purchase: z.object({ mode: z.enum(["exact", "from"]), number: count }).optional(),
  totalLimit: count.optional(),
  personalLimit: count.optional(),
  fromDate: z.iso.date().optional(),
  throughDate: z.iso.date().optional(),
});
export const promoCommand = z.object({
  action: z.enum(["draft", "publish", "disable", "enable", "repeat"]),
  revision: z.number().int().nonnegative(),
  terms: promoTerms.optional(),
});
export const promoListInput = z.object({
  status: z.enum(promoStatuses).optional(),
  kind: z.enum([...promoKinds, "price"]).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
export const promoExampleInput = z.object({
  terms: promoTerms,
  lines: z.array(z.object({ variantId: id, quantity: count.max(999) })).max(50),
  confirmed: z.boolean(),
  completed: z.number().int().min(0).max(1_000_000),
});
export const promoReasons = [
  "applied",
  "better_automatic",
  "unknown",
  "expired",
  "disabled",
  "scheduled",
  "limit",
  "personal_limit",
  "telegram",
  "purchase_early",
  "purchase_passed",
  "purchase_used",
  "minimum",
  "quantity",
  "scope",
  "regular_price",
] as const;
export type PromoReason = (typeof promoReasons)[number];
export type PromoTerms = z.infer<typeof promoTerms>;
export type PromoStatus = (typeof promoStatuses)[number];
export type PromoOffer = {
  id: string;
  revision: number;
  terms: PromoTerms;
  status: PromoStatus;
  used: number;
  orders: number;
  savingsMinor: number;
};

export type PromoPrice = {
  variantId: string;
  productId: string;
  variantName: string;
  productName: string;
  priceMinor: number;
  oldPriceMinor: number;
  status: "active" | "scheduled";
  fromDate?: string;
  throughDate?: string;
  image: CatalogImage | null;
};
