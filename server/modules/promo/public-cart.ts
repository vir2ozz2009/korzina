import type { Cart } from "../../../src/shared/contracts/cart";
import type { PublicPromo } from "../../../src/shared/contracts/promo";
import { assess, type Buyer, type Candidate } from "./calculate";
import { promoContext } from "./cart";

export function publicCartPromos(
  storage: DurableObjectStorage,
  customer: string,
  cart: Cart,
  now: number,
  id?: string,
) {
  const { candidates, buyer } = promoContext(
    storage,
    customer,
    customer.startsWith("telegram:"),
    { code: null, alternative: null },
    now,
    true,
    id,
  );
  return assessPublicCandidates(candidates, cart, buyer);
}

export function assessPublicCandidates(candidates: Candidate[], cart: Cart, buyer: Buyer) {
  const lines = cart.lines.filter((line) => line.available && line.quantity > 0);
  return candidates.flatMap((offer) => {
    const group = offer.terms.group;
    const base = assess(offer, lines, buyer);
    const missingQuantity =
      group?.type === "bundle"
        ? group.components.reduce(
            (sum, { variantId, quantity }) =>
              sum + Math.max(0, quantity - (lines.find((line) => line.variantId === variantId)?.quantity ?? 0)),
            0,
          )
        : 0;
    const result = !base.reason && missingQuantity ? { reason: "quantity" as const, missingQuantity } : base;
    if (result.reason && result.reason !== "minimum" && result.reason !== "quantity") return [];
    return [{ offer, result }];
  });
}

export function listPublicCartPromos(
  storage: DurableObjectStorage,
  customer: string,
  cart: Cart,
  now: number,
): PublicPromo[] {
  return describePublicPromos(storage, publicCartPromos(storage, customer, cart, now));
}

export function describePublicPromos(
  storage: DurableObjectStorage,
  publicOffers: ReturnType<typeof assessPublicCandidates>,
): PublicPromo[] {
  const scopes = publicOffers.flatMap(
    ({
      offer: {
        id,
        terms: { scope, group },
      },
    }) =>
      group?.type === "bundle"
        ? group.components.map(({ variantId }) => [id, "variants", variantId])
        : scope.type === "all"
          ? []
          : scope.ids.map((item) => [id, scope.type, item]),
  );
  const names = new Map<string, string[]>();
  if (scopes.length) {
    const rows = storage.sql
      .exec<{ offer: string; name: string }>(
        `WITH scope AS (
        SELECT json_extract(value,'$[0]') offer,json_extract(value,'$[1]') kind,json_extract(value,'$[2]') id
        FROM json_each(?)
      )
      SELECT s.offer,c.name FROM scope s JOIN categories c ON s.kind='categories' AND c.id=s.id WHERE c.visible
      UNION ALL SELECT s.offer,p.name FROM scope s JOIN products p ON s.kind='products' AND p.id=s.id
        WHERE p.published AND p.visible
      UNION ALL SELECT s.offer,p.name || CASE WHEN v.name='' THEN '' ELSE ' · ' || v.name END
        FROM scope s JOIN variants v ON s.kind='variants' AND v.id=s.id JOIN products p ON p.id=v.product_id
        WHERE v.visible AND v.product_available
      ORDER BY 2`,
        JSON.stringify(scopes),
      )
      .toArray();
    for (const { offer, name } of rows) {
      const known = names.get(offer);
      if (known) known.push(name);
      else names.set(offer, [name]);
    }
  }
  return publicOffers.map(({ offer, result }) => {
    const {
      name,
      kind,
      code,
      scope,
      group,
      discount,
      minimumMinor,
      minimumQuantity,
      confirmed,
      purchase,
      personalLimit,
      fromDate,
      throughDate,
    } = offer.terms;
    const scopeNames = scope.type === "all" && group?.type !== "bundle" ? ["Все товары"] : (names.get(offer.id) ?? []);
    return {
      id: offer.id,
      name,
      kind,
      code,
      scopeNames,
      discount,
      group,
      minimumMinor,
      minimumQuantity,
      confirmed,
      purchase,
      personalLimit,
      fromDate,
      throughDate,
      applicable: !result.reason,
      missingMinor: result.missingMinor,
      missingQuantity: result.missingQuantity,
    };
  });
}
