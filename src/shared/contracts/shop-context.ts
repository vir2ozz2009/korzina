import { z } from "zod";
import { resolveFeatures } from "../flags";
import { normalizeTheme } from "../theme-presets";
import { shopContract } from "./shop";

export const shopContextContract = shopContract.extend({
  features: z
    .record(z.string(), z.boolean())
    .transform((values) => resolveFeatures(Object.entries(values).map(([key, enabled]) => ({ key, enabled })))),
  theme: z.unknown().transform(normalizeTheme),
});
export type ShopContext = z.infer<typeof shopContextContract>;
