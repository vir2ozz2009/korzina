import { z } from "zod";

const productId = z.string().min(1).max(120);
export const favoriteInput = z.strictObject({ productId, selected: z.boolean() });
export const favoriteIdsInput = z.strictObject({ ids: z.array(productId).max(200) });
