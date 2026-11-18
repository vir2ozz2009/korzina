import { z } from "zod";

const catalogScope = z.string().regex(/^(all|category:.{1,120}|brand:.{1,120})$/);
export type CatalogScope = "all" | `category:${string}` | `brand:${string}`;
const filterId = z.string().min(1).max(120);
const price = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional();
const catalogFiltersInput = z.object({
  sort: z.enum(["default", "price-asc", "price-desc", "name"]).optional(),
  min: price,
  max: price,
  brands: z.string().max(1000).optional(),
  cat: filterId.optional(),
  inStock: z.enum(["1"]).optional(),
});
export type CatalogFilters = z.infer<typeof catalogFiltersInput>;
export const catalogListInput = catalogFiltersInput
  .extend({
    scope: catalogScope.default("all"),
    count: z.literal("1").optional(),
    cursor: z.string().min(1).max(1024).optional(),
    version: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .refine((value) => value.min === undefined || value.max === undefined || value.min <= value.max);
export const catalogSearchInput = catalogListInput.safeExtend({ q: z.string().trim().min(2).max(180) });
export type CatalogSearchInput = z.infer<typeof catalogSearchInput>;
export type CatalogListInput = z.infer<typeof catalogListInput>;
export function usesLiveSelection(input: CatalogFilters) {
  return (
    (input.sort && input.sort !== "default") ||
    input.min !== undefined ||
    input.max !== undefined ||
    Boolean(input.brands || input.cat || input.inStock)
  );
}
