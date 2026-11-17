import { z } from "zod";

export const cartChangeInput = z.object({
  variantId: z.string().min(1).max(120),
  quantity: z.number().int().min(0).max(999),
  expectedRevision: z.number().int().nonnegative(),
});
export type CartChangeInput = z.infer<typeof cartChangeInput>;
export type CartLine = {
  variantId: string;
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  priceMinor: number;
  stock: number | null;
  available: boolean;
};
export type Cart = { revision: number; currency: string | null; lines: CartLine[]; count: number; totalMinor: number };
