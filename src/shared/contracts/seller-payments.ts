import { z } from "zod";

export const paymentImageLimit = 1024 * 1024;
export const paymentOptionId = z.union([z.enum(["cash", "transfer"]), z.uuid()]);
const template = z.enum(["cash", "card", "sbp", "crypto", "custom"]);
const paymentOptionDraft = z.strictObject({
  id: paymentOptionId,
  template,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  instruction: z.string().trim().max(2000).optional(),
  details: z.string().trim().max(500).optional(),
  imageId: z.uuid().nullable().optional(),
  requiresReceipt: z.boolean(),
  enabled: z.boolean(),
});

export const paymentOptionInput = paymentOptionDraft.extend({ imageSrc: z.string().min(1).optional() });
export const saveSellerPayments = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  options: z
    .array(paymentOptionDraft)
    .max(20)
    .refine(
      (options) =>
        new Set(options.map(({ id }) => id)).size === options.length &&
        options.every(
          ({ id, template, requiresReceipt, imageId }) =>
            (template === "cash") === (id === "cash") && (template !== "cash" || (!requiresReceipt && !imageId)),
        ),
    ),
});

export type PaymentOption = z.infer<typeof paymentOptionInput>;
export type SaveSellerPayments = z.infer<typeof saveSellerPayments>;
