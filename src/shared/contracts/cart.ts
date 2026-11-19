import { z } from "zod";
import { catalogImageContract } from "./catalog";

const expectedRevision = z.number().int().nonnegative();
const cartChangeInput = z.object({
  variantId: z.string().min(1).max(120),
  quantity: z.number().int().min(0).max(999),
  expectedRevision,
});
export const cartCommandInput = z.union([cartChangeInput, z.object({ confirm: z.literal(true), expectedRevision })]);
export type CartCommandInput = z.infer<typeof cartCommandInput>;
const money = z.number().int();
const cartLine = z.object({
  variantId: z.string(),
  productId: z.string(),
  name: z.string(),
  unit: z.string(),
  quantity: z.number().int().positive(),
  priceMinor: money,
  stock: z.number().int().nullable(),
  available: z.boolean(),
  image: catalogImageContract.nullable().optional(),
  totalMinor: money.optional(),
});
const cartAdjustment = z.object({ kind: z.string(), sourceId: z.string(), label: z.string(), amount: money });
const cartIssue = z.object({
  variantId: z.string(),
  oldPriceMinor: money.optional(),
  remaining: z.number().int().nonnegative().optional(),
  unavailable: z.boolean().optional(),
});
const cartReview = z.object({ beforeMinor: money, changes: z.array(cartIssue) });
export const cartContract = z.object({
  revision: expectedRevision,
  currency: z.string().nullable(),
  lines: z.array(cartLine),
  count: z.number().int().nonnegative(),
  totalMinor: money,
  adjustments: z.array(cartAdjustment),
  review: cartReview.optional(),
});
export type CartLine = z.infer<typeof cartLine>;
export type CartAdjustment = z.infer<typeof cartAdjustment>;
export type CartIssue = z.infer<typeof cartIssue>;
export type CartReview = z.infer<typeof cartReview>;
export type Cart = z.infer<typeof cartContract>;
