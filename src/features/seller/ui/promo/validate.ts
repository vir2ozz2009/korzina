import { type PromoTerms, promoTerms } from "../../../../shared/contracts/promo";
export function validatedPromo(candidate?: PromoTerms) {
  const parsed = promoTerms.safeParse(candidate);
  if (
    !parsed.success ||
    !candidate?.name ||
    (!candidate.delivery && !candidate.group && !candidate.discount.value) ||
    (candidate.group?.type === "gift" && candidate.scope.type === "all") ||
    (candidate.group?.type === "bundle" &&
      (!candidate.group.priceMinor ||
        !candidate.group.components.length ||
        new Set(candidate.group.components.map(({ variantId }) => variantId)).size !==
          candidate.group.components.length)) ||
    (candidate.kind === "code" && !candidate.code) ||
    (candidate.scope.type !== "all" && !candidate.scope.ids.length) ||
    (candidate.fromDate && candidate.throughDate && candidate.fromDate > candidate.throughDate)
  ) {
    return undefined;
  }
  return parsed.data;
}
