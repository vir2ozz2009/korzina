import { z } from "zod/mini";
import { resolveFeatures } from "../flags";
import { normalizeTheme } from "../theme-presets";
import { shopContract } from "./shop";

export const shopContextContract = z.extend(shopContract, {
  teamPreview: z.optional(z.boolean()),
  mediaOrigin: z.optional(z.string()),
  timeZone: z.optional(z.string()),
  orderBanners: z.optional(z.array(z.object({ text: z.string(), expires: z.nullable(z.number()) }))),
  receiving: z.optional(
    z.object({
      today: z.string(),
      timeZone: z.string(),
      refreshAt: z.number(),
      banners: z.array(z.object({ text: z.string(), expires: z.nullable(z.number()) })),
      methods: z.array(
        z.object({
          method: z.enum(["delivery", "pickup"]),
          mode: z.enum(["after_order", "unknown", "day", "slots"]),
          date: z.optional(z.string()),
          start: z.optional(z.string()),
          end: z.optional(z.string()),
        }),
      ),
    }),
  ),
  profile: z.optional(
    z.object({
      logo: z.nullable(z.object({ id: z.string(), shape: z.enum(["circle", "square", "wide"]), src: z.string() })),
      address: z.optional(z.string()),
      phone: z.optional(z.string()),
      email: z.optional(z.string()),
      telegram: z.optional(z.string()),
    }),
  ),
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
