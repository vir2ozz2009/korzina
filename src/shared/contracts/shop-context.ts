import { z } from "zod/mini";
import { resolveFeatures } from "../flags";
import { normalizeTheme } from "../theme-presets";
import { shopContract } from "./shop";

export const shopContextContract = z.extend(shopContract, {
  mediaOrigin: z.optional(z.string()),
  timeZone: z.optional(z.string()),
  features: z.pipe(
    z.record(z.string(), z.boolean()),
    z.transform((values) => resolveFeatures(Object.entries(values).map(([key, enabled]) => ({ key, enabled })))),
  ),
  theme: z.pipe(z.unknown(), z.transform(normalizeTheme)),
  adminSettings: z.optional(
    z.object({
      name: z.string(),
      country: z.string(),
      currency: z.nullable(z.string()),
      timeZone: z.string(),
      theme: z.pipe(z.unknown(), z.transform(normalizeTheme)),
    }),
  ),
});
export type ShopContext = z.infer<typeof shopContextContract>;
