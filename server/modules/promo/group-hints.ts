import type { Cart, CartAdjustment, CartLine } from "../../../src/shared/contracts/cart";
import type { PromoTerms } from "../../../src/shared/contracts/promo";
import type { Candidate } from "./calculate";
import type { BundleComponent } from "./group-catalog";
import { inScope } from "./group-terms";

type Hint = NonNullable<NonNullable<Cart["promo"]>["groupHints"]>[number];

export function groupHints(
  groups: Candidate[],
  source: CartLine[],
  adjustments: CartAdjustment[],
  label: (terms: PromoTerms) => string,
  code: string | undefined,
  components: ReadonlyMap<string, BundleComponent> | undefined,
  withoutOffer: (lines: CartLine[], excludedId: string) => number,
): Hint[] {
  return groups.flatMap((offer): Hint[] => {
    const { terms } = offer;
    const group = terms.group;
    if (!group || offer.status !== "active" || (terms.totalLimit && offer.used >= terms.totalLimit)) return [];
    if (terms.kind === "code" && !terms.publicInCart && terms.code !== code) return [];
    const scoped = source.filter((line) => inScope(terms, line));
    if (!scoped.length) return [];
    const won = adjustments.find(({ sourceId }) => sourceId === offer.id)?.groups;
    if (won?.limit && won.count >= won.limit) return [];
    if (group.type === "gift") {
      if (adjustments.some((item) => !item.groups || item.groups.type === "bundle")) return [];
      return scoped.flatMap((line) => {
        const size = group.buy + group.gift;
        const quantity = size - (line.quantity % size);
        if (quantity === size || (line.stock ?? 999) < line.quantity + quantity) return [];
        if (won?.type === "gift" && won.count < Math.floor(line.quantity / size)) return [];
        return [
          {
            id: offer.id,
            type: group.type,
            name: label(terms),
            missing: [{ variantId: line.variantId, quantity, name: line.name, unit: line.unit }],
          },
        ];
      });
    }
    if (!components || !group.components.length) return [];
    const parts = group.components.map((part) => {
      const row = components.get(part.variantId);
      const inCart = scoped.find(({ variantId }) => variantId === part.variantId)?.quantity ?? 0;
      return { ...part, row, inCart };
    });
    if (parts.some(({ row }) => !row))
      return [
        {
          id: offer.id,
          type: "bundle",
          name: terms.name,
          missing: [],
          unavailable: true,
        },
      ];
    const possible = Math.min(...parts.map(({ inCart, quantity }) => Math.floor(inCart / quantity)));
    const limit = group.limit === null ? undefined : (group.limit ?? 1);
    if ((limit !== undefined && possible >= limit) || (possible > 0 && !won)) return [];
    const missing = parts.flatMap(({ variantId, quantity, inCart, row }) => {
      const needed = (possible + 1) * quantity - inCart;
      return needed > 0 && row ? [{ variantId, quantity: needed, name: row.name, unit: row.unit }] : [];
    });
    const unavailable = parts.some(
      ({ row, inCart, quantity }) => Math.max(inCart, (possible + 1) * quantity) > (row?.stock ?? 999),
    );
    if (unavailable || !missing.length) return [];
    const oneSet = parts.flatMap(({ row, variantId, quantity }) =>
      row
        ? [
            {
              variantId,
              productId: row.productId,
              categoryId: row.categoryId,
              name: row.name,
              unit: row.unit,
              quantity,
              priceMinor: row.priceMinor,
              stock: row.stock,
              available: true,
            },
          ]
        : [],
    );
    const alternativeTotal = withoutOffer(oneSet, offer.id);
    if (group.priceMinor >= alternativeTotal) return [];
    return [
      {
        id: offer.id,
        type: "bundle",
        name: terms.name,
        missing,
        priceMinor: group.priceMinor,
        savingsMinor: alternativeTotal - group.priceMinor,
        code: terms.code !== code ? terms.code : undefined,
        remainingSets: won && limit !== undefined ? limit - won.count : undefined,
      },
    ];
  });
}
