import type { CatalogGroupPromo } from "../../../src/shared/contracts/catalog";
import type { PromoTerms } from "../../../src/shared/contracts/promo";
import { addMinor, multiplyMinor } from "../../../src/shared/money";

const liveGroupOffer = (now: number) => `p.state='published'
  AND (p.starts_at IS NULL OR p.starts_at<=${Math.trunc(now)})
  AND (p.ends_at IS NULL OR p.ends_at>${Math.trunc(now)})
  AND json_type(p.terms,'$.group')='object'
  AND (p.kind='automatic' OR json_extract(p.terms,'$.publicInCart')=1)`;

export const groupOfferJson = (now: number) => `(SELECT json_group_array(json_object('id',p.id,'terms',json(p.terms)))
  FROM promo_offers p WHERE ${liveGroupOffer(now)}) AS groupOffers`;

type GroupOffer = { id: string; terms: PromoTerms };
export type BundleComponent = {
  variantId: string;
  productId: string;
  categoryId: string | null;
  name: string;
  unit: string;
  stock: number | null;
  priceMinor: number;
};

export function bundleComponents(storage: DurableObjectStorage, offers: GroupOffer[], now: number) {
  const ids = new Set(
    offers.flatMap(({ terms }) =>
      terms.group?.type === "bundle" ? terms.group.components.map(({ variantId }) => variantId) : [],
    ),
  );
  if (!ids.size) return new Map<string, BundleComponent>();
  return new Map(
    storage.sql
      .exec<BundleComponent>(
        `SELECT v.id AS variantId,v.product_id AS productId,p.category_id AS categoryId,p.name,v.name AS unit,v.stock,
      CASE WHEN (v.promo_starts_at IS NULL OR v.promo_starts_at<=?) AND (v.promo_ends_at IS NULL OR v.promo_ends_at>?)
        THEN v.price_minor ELSE COALESCE(v.old_price_minor,v.price_minor) END AS priceMinor
      FROM variants v JOIN products p ON p.id=v.product_id
      WHERE v.id IN (SELECT value FROM json_each(?)) AND v.visible AND v.product_available AND NOT v.product_paused
      AND v.sale_pause IS NULL AND (v.stock IS NULL OR v.stock>0)`,
        now,
        now,
        JSON.stringify([...ids]),
      )
      .toArray()
      .map((row) => [row.variantId, row]),
  );
}

export function catalogGroupPromos(storage: DurableObjectStorage, data: string, now: number) {
  const rows = JSON.parse(data) as GroupOffer[];
  const eligible = rows.filter(({ terms }) => !terms.confirmed && !terms.purchase && !terms.personalLimit);
  const components = bundleComponents(storage, eligible, now);
  const bundles = new Map<string, CatalogGroupPromo>();
  for (const { id, terms } of eligible) {
    const group = terms.group;
    if (group?.type !== "bundle" || !group.components.length) continue;
    const parts = group.components.flatMap(({ variantId, quantity }) => {
      const row = components.get(variantId);
      return row && (row.stock ?? 999) >= quantity ? [{ ...row, quantity }] : [];
    });
    if (
      parts.length !== group.components.length ||
      addMinor(...parts.map(({ priceMinor, quantity }) => multiplyMinor(priceMinor, quantity))) <= group.priceMinor
    )
      continue;
    bundles.set(id, {
      type: "bundle",
      id,
      name: terms.name,
      priceMinor: group.priceMinor,
      limit: group.limit === null ? undefined : (group.limit ?? 1),
      code: terms.code,
      components: parts.map(({ variantId, name, unit, quantity }) => ({ variantId, name, unit, quantity })),
    });
  }
  return (
    variant: { id: string; stock: number | null; available: boolean },
    productId: string,
    categoryId?: string | null,
  ) => {
    if (!variant.available) return;
    const applicable = eligible
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .flatMap(({ id, terms }): CatalogGroupPromo[] => {
        const { group, scope } = terms;
        if (group?.type === "gift" && (variant.stock ?? 999) >= group.buy + group.gift) {
          const match =
            scope.type === "all" ||
            scope.ids.includes(
              (scope.type === "categories" ? categoryId : scope.type === "products" ? productId : variant.id) ?? "",
            );
          return match ? [{ type: "gift", id, buy: group.buy, gift: group.gift }] : [];
        }
        const bundle = bundles.get(id);
        return bundle?.type === "bundle" && bundle.components.some(({ variantId }) => variantId === variant.id)
          ? [bundle]
          : [];
      });
    return applicable.length ? applicable : undefined;
  };
}
