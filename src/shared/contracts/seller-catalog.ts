import { z } from "zod";
import type { CatalogImage, CatalogTile } from "./catalog";
import { cropPositionContract } from "./media";

const id = z.string().min(1).max(120);
const integer = z.number().int().nonnegative();
const stock = integer.nullable();
const saleDuration = z.enum(["tomorrow", "manual"]);
const status = z.enum(["selling", "unavailable", "hidden"]);
const recommendations = z.enum(["auto", "manual", "off"]);
const distinctIds = (max: number) =>
  z
    .array(id)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length);
const productRevision = z.strictObject({ id, revision: integer });

export const sellerProductQuery = z.object({
  q: z.string().max(120).optional(),
  filter: z.enum(["all", "out_of_stock", "low_stock", "hidden", "uncategorized"]).default("all"),
  category: id.optional(),
  brand: id.optional(),
  cursor: z.string().max(1500).optional(),
});
export type SellerProductQuery = z.input<typeof sellerProductQuery>;

const sellerPhotoInput = z.strictObject({ id, cropPosition: cropPositionContract.optional() });
export type SellerPhotoInput = z.infer<typeof sellerPhotoInput>;
const variantInput = z.strictObject({
  id: id.optional(),
  name: z.string().trim().max(120),
  priceMinor: integer,
  oldPriceMinor: integer.nullable(),
  visible: z.boolean(),
  stock,
  stockBaseline: z.strictObject({ stock, revision: integer, purchased: integer }).optional(),
  pause: z.union([saleDuration, z.literal("resume")]).optional(),
});
export const sellerProductInput = z.strictObject({
  expectedRevision: integer.optional(),
  name: z.string().trim().min(1).max(150),
  description: z.string().max(2500),
  ingredients: z.string().max(1200),
  storageNotes: z.string().max(1200),
  categoryId: id.nullable(),
  brandId: id.nullable(),
  status,
  pause: saleDuration.optional(),
  recommendations,
  recommendationIds: distinctIds(10),
  photos: z
    .array(sellerPhotoInput)
    .max(12)
    .refine((photos) => new Set(photos.map((photo) => photo.id)).size === photos.length),
  variants: z.array(variantInput).min(1).max(20),
});
export type SellerProductInput = z.infer<typeof sellerProductInput>;

const changedStock = z.strictObject({ id, stock, revision: integer });
export const sellerStockInput = z
  .array(changedStock)
  .min(1)
  .max(20)
  .refine((edits) => new Set(edits.map((edit) => edit.id)).size === edits.length);
export type SellerStockInput = z.infer<typeof sellerStockInput>;
export const sellerBulkInput = z.strictObject({
  products: z
    .array(productRevision)
    .min(1)
    .max(32)
    .refine((products) => new Set(products.map((product) => product.id)).size === products.length),
  action: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("pause"), duration: saleDuration, variantId: id.optional() }),
    z.strictObject({ kind: z.literal("resume"), stock: sellerStockInput.optional(), variantId: id.optional() }),
    z.strictObject({ kind: z.literal("hide") }),
    z.strictObject({ kind: z.literal("show") }),
    z.strictObject({ kind: z.literal("category"), categoryId: id.nullable() }),
    z.strictObject({ kind: z.literal("stock"), variants: sellerStockInput }),
    z.strictObject({ kind: z.literal("delete") }),
  ]),
});
export type SellerBulkInput = z.infer<typeof sellerBulkInput>;
export const sellerCopyInput = productRevision.pick({ revision: true });
export const sellerCatalogId = z.object({ id });

export type SellerProductStatus = z.infer<typeof status>;
type SellerPhoto = Pick<CatalogTile, "id"> & { image: CatalogImage };
export type SellerVariant = {
  id: string;
  name: string;
  priceMinor: number;
  oldPriceMinor: number | null;
  stock: number | null;
  stockRevision: number;
  purchased: number;
  visible: boolean;
  salePause: number | null;
};
export type SellerProductRow = {
  id: string;
  name: string;
  image: CatalogImage | null;
  priceMinor: number | null;
  variantCount: number;
  stock: number | null;
  status: SellerProductStatus;
  salePause: number | null;
  revision: number;
};
export type SellerProduct = Omit<SellerProductRow, "image" | "priceMinor" | "stock" | "variantCount"> & {
  description: string;
  ingredients: string;
  storageNotes: string;
  categoryId: string | null;
  brandId: string | null;
  recommendations: z.infer<typeof recommendations>;
  recommendationIds: string[];
  variants: SellerVariant[];
  photos: SellerPhoto[];
};
export type SellerStockConflict = {
  id: string;
  before: number | null;
  stock: number | null;
  revision: number;
  purchased: number;
  bought?: number;
};
