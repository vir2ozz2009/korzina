import { z } from "zod";
import { cropPositionContract, photoMetadataContract } from "./media";

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

export const catalogImageContract = photoMetadataContract.extend({
  cropPosition: cropPositionContract.optional(),
  src: z.string(),
  srcSet: z.string(),
  original: z.object({ src: z.string() }),
});
export type CatalogImage = z.infer<typeof catalogImageContract>;

const tile = z.object({
  id,
  name: z.string(),
  categoryId: id,
  brandId: id.nullable(),
  image: catalogImageContract.nullable(),
  variants: z.array(z.object({ id, name: z.string(), photoId: id.nullable() })),
});
export type CatalogTile = z.infer<typeof tile>;

const groupPromo = z.discriminatedUnion("type", [
  z.object({ type: z.literal("gift"), id, buy: z.number().int(), gift: z.number().int() }),
  z.object({
    type: z.literal("bundle"),
    id,
    name: z.string(),
    priceMinor: z.number().int(),
    limit: z.number().int().optional(),
    code: z.string().optional(),
    components: z.array(z.object({ variantId: id, name: z.string(), unit: z.string(), quantity: z.number().int() })),
  }),
]);
export type CatalogGroupPromo = z.infer<typeof groupPromo>;

const offer = z.object({
  id,
  productId: id.nullable(),
  priceMinor: z.number().int().nullable(),
  oldPriceMinor: z.number().int().nullable(),
  stock: z.number().int().nullable(),
  groupPromos: z.array(groupPromo).optional(),
  visible: z.boolean(),
  available: z.boolean(),
});
export type CatalogOffer = z.infer<typeof offer>;

const categorySize = z.enum(["1x1", "2x1", "1x2", "2x2"]);
export type CatalogCategorySize = z.infer<typeof categorySize>;
const section = z.object({
  id,
  name: z.string(),
  parentId: id.nullable(),
  tileSize: categorySize.optional(),
  hasProducts: z.boolean(),
  image: catalogImageContract.nullable(),
});
export const catalogDocumentContract = z.object({
  catalogVersion: z.number().int(),
  count: z.number().int().nonnegative().nullable(),
  categories: z.array(section),
  brands: z.array(section),
  items: z.array(tile),
  next: z.string().nullable(),
});
export const catalogOffersContract = z.object({
  catalogVersion: z.number().int(),
  currency: z.string(),
  hideOutOfStock: z.boolean(),
  items: z.array(offer),
});
export const catalogListContract = catalogDocumentContract.extend({ offers: catalogOffersContract });
const preferred = z.record(id, id);
export const catalogSearchContract = catalogListContract.extend({
  count: z.number().int().nonnegative(),
  preferred,
  suggestion: z.string().nullable(),
});
export const shoppingSearchContract = z.object({
  items: z.array(tile),
  offers: catalogOffersContract,
  groups: z.array(z.object({ term: z.string(), ids: z.array(id), preferred })),
});

export const catalogProductContract = tile.omit({ image: true, variants: true }).extend({
  description: z.string(),
  ingredients: z.string().optional(),
  storageNotes: z.string().optional(),
  brandName: z.string().nullable(),
  catalogVersion: z.number().int(),
  currency: z.string(),
  variants: z.array(
    z.object({
      id,
      name: z.string(),
      photoId: id.nullable(),
      priceMinor: z.number().int(),
      oldPriceMinor: z.number().int().nullable(),
      stock: z.number().int().nullable(),
      available: z.boolean(),
      groupPromos: z.array(groupPromo).optional(),
    }),
  ),
  images: z.array(catalogImageContract.extend({ id })),
  recommendations: z.object({ items: z.array(tile), offers: z.array(offer) }),
});
