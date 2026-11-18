import { z } from "zod";
import type { CatalogImage } from "./catalog";

const expectedRevision = z.number().int().nonnegative();
const cartChangeInput = z.object({
  variantId: z.string().min(1).max(120),
  quantity: z.number().int().min(0).max(999),
  expectedRevision,
});
export const cartCommandInput = z.union([cartChangeInput, z.object({ confirm: z.literal(true), expectedRevision })]);
export type CartCommandInput = z.infer<typeof cartCommandInput>;
export type CartLine = {
  variantId: string;
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  priceMinor: number;
  stock: number | null;
  available: boolean;
  image?: CatalogImage | null;
  totalMinor?: number;
};
export type CartAdjustment = { kind: string; sourceId: string; label: string; amount: number };
export type CartIssue = { variantId: string; oldPriceMinor?: number; remaining?: number; unavailable?: boolean };
export type CartReview = { beforeMinor: number; changes: CartIssue[] };
export type Cart = {
  revision: number;
  currency: string | null;
  lines: CartLine[];
  count: number;
  totalMinor: number;
  adjustments: CartAdjustment[];
  review?: CartReview;
};
