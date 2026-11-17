import { z } from "zod/mini";

export const shopContract = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.string(),
  plan: z.string(),
  createdAt: z.int(),
});
export type ShopInfo = z.infer<typeof shopContract>;
