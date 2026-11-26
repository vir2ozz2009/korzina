import type { CartLine } from "../../../src/shared/contracts/cart";
import type { PromoTerms } from "../../../src/shared/contracts/promo";
import { ApiError } from "../../../src/shared/errors";

export function inScope(terms: PromoTerms, line: CartLine) {
  const { scope, group } = terms;
  if (group?.type === "bundle") return group.components.some(({ variantId }) => variantId === line.variantId);
  if (scope.type === "all") return true;
  const id = scope.type === "products" ? line.productId : scope.type === "variants" ? line.variantId : line.categoryId;
  return !!id && scope.ids.includes(id);
}

export function validateGroup(storage: DurableObjectStorage, terms: PromoTerms, publishing: boolean) {
  const group = terms.group;
  if (!group) return;
  if (group.type === "gift") {
    if (terms.kind !== "automatic" || (publishing && terms.scope.type === "all"))
      throw new ApiError("VALIDATION", "Выберите участвующие товары или фасовки");
    return;
  }
  const ids = group.components.map(({ variantId }) => variantId);
  if (ids.length !== new Set(ids).size)
    throw new ApiError("VALIDATION", "Каждая фасовка может быть в составе только один раз");
  if (publishing && (!ids.length || !group.priceMinor))
    throw new ApiError("VALIDATION", "Укажите состав и цену набора");
  if (!publishing) return;
  const { found } = storage.sql
    .exec<{ found: number }>(
      `SELECT COUNT(*) AS found FROM variants WHERE id IN (SELECT value FROM json_each(?))
    AND visible AND product_available AND NOT product_paused AND sale_pause IS NULL AND (stock IS NULL OR stock>0)`,
      JSON.stringify(ids),
    )
    .one();
  if (found !== ids.length) throw new ApiError("VALIDATION", "Замените недоступную фасовку в наборе");
}
