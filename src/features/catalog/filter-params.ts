import type { CatalogFilters } from "../../shared/contracts/catalog-list";

function minor(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function readFilterParams(search: Record<string, unknown>): CatalogFilters {
  const sort = search.sort;
  const min = minor(search.min);
  const max = minor(search.max);
  const validRange = min === undefined || max === undefined || min <= max;
  return {
    sort: sort === "price-asc" || sort === "price-desc" || sort === "name" ? sort : undefined,
    min: validRange ? min : undefined,
    max: validRange ? max : undefined,
    brands: typeof search.brands === "string" && search.brands.length <= 1_000 ? search.brands : undefined,
    cat: typeof search.cat === "string" && search.cat.length <= 120 ? search.cat : undefined,
    inStock: search.inStock === "1" || search.inStock === 1 ? "1" : undefined,
  };
}
