import { z } from "zod";
import { catalogImageContract } from "./catalog";
import { promoCode, promoReasons } from "./promo";

const expectedRevision = z.number().int().nonnegative();
const cartChangeInput = z.object({
  variantId: z.string().min(1).max(120),
  quantity: z.number().int().min(0).max(999),
  expectedRevision,
});
export const cartCommandInput = z.union([
  cartChangeInput,
  z.object({ confirm: z.literal(true), expectedRevision }),
  z.object({ promoAction: z.enum(["remove", "keep"]), expectedRevision }),
  z.object({
    promoAction: z.literal("compare"),
    code: promoCode,
    publicOfferId: z.string().max(120).optional(),
    expectedRevision,
  }),
  z.object({
    promoAction: z.literal("apply"),
    code: promoCode,
    publicOfferId: z.string().max(120).optional(),
    comparedTotal: z.number().int().nonnegative().optional(),
    expectedRevision,
  }),
]);
export type CartCommandInput = z.infer<typeof cartCommandInput>;
const money = z.number().int();
const cartLine = z.object({
  variantId: z.string(),
  productId: z.string(),
  name: z.string(),
  unit: z.string(),
  quantity: z.number().int().positive(),
  priceMinor: money,
  oldPriceMinor: money.nullable().optional(),
  categoryId: z.string().nullable().optional(),
  nextPriceAt: z.number().nullable().optional(),
  stock: z.number().int().nullable(),
  available: z.boolean(),
  image: catalogImageContract.nullable().optional(),
  totalMinor: money.optional(),
});
const cartAdjustment = z.object({
  kind: z.string(),
  sourceId: z.string(),
  label: z.string(),
  amount: money,
  sourceRevision: z.number().optional(),
  code: z.string().optional(),
  minimumMinor: money.optional(),
  purchase: z.object({ mode: z.enum(["exact", "from"]), number: z.number() }).optional(),
  allocations: z.array(z.object({ variantId: z.string(), amount: money })).optional(),
});
const promoResult = z.object({
  code: z.string().optional(),
  reason: z.enum(promoReasons).optional(),
  missingMinor: money.optional(),
  missingQuantity: z.number().optional(),
  hint: z.object({ missingMinor: money, label: z.string(), publicOfferId: z.string().optional() }).optional(),
  telegramHint: z.boolean().optional(),
  alternative: z
    .object({
      code: z.string(),
      totalMinor: money,
      reason: z.enum(promoReasons).optional(),
      missingMinor: money.optional(),
      missingQuantity: z.number().optional(),
    })
    .optional(),
  nextChangeAt: z.number().optional(),
});
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
  itemsMinor: money.optional(),
  promo: promoResult.optional(),
  review: cartReview.optional(),
});
export type CartLine = z.infer<typeof cartLine>;
export type CartAdjustment = z.infer<typeof cartAdjustment>;
export type CartIssue = z.infer<typeof cartIssue>;
export type CartReview = z.infer<typeof cartReview>;
export type Cart = z.infer<typeof cartContract>;
