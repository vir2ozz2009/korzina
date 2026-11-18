import { z } from "zod";
import type { PhotoMetadata } from "./media";

const id = z.string().min(1).max(120);
export const catalogPageInput = z.object({
  after: id.optional(),
  productIds: z.string().max(2000).optional(),
  count: z.literal("1").optional(),
  category: id.optional(),
  brand: id.optional(),
  version: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});
export const catalogLiveInput = z.object({
  ids: z
    .string()
    .transform((value) => [...new Set(value.split(","))])
    .pipe(z.array(id).min(1).max(50)),
});
export type CatalogPageInput = z.infer<typeof catalogPageInput>;

export type CatalogImage = PhotoMetadata & { src: string; srcSet: string; original: { src: string } };
export type CatalogTile = {
  id: string;
  name: string;
  categoryId: string;
  brandId: string | null;
  image: CatalogImage | null;
  variants: { id: string; name: string; photoId: string | null }[];
};
export type CatalogOffer = {
  id: string;
  productId: string | null;
  priceMinor: number | null;
  oldPriceMinor: number | null;
  stock: number | null;
  visible: boolean;
  available: boolean;
};
