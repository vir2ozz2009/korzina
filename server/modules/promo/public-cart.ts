import type { Cart } from "../../../src/shared/contracts/cart";
import type { PublicPromo } from "../../../src/shared/contracts/promo";
import { assess } from "./calculate";
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
  const lines = cart.lines.filter((line) => line.available && line.quantity > 0);
  return candidates.flatMap((offer) => {
    const result = assess(offer, lines, buyer);
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
  return publicCartPromos(storage, customer, cart, now).map(({ offer, result }) => {
    const {
      name,
      kind,
      code,
      scope,
      discount,
      minimumMinor,
      minimumQuantity,
      confirmed,
      purchase,
      personalLimit,
      fromDate,
      throughDate,
    } = offer.terms;
    const scopeNames =
      scope.type === "all"
        ? ["Все товары"]
        : storage.sql
            .exec<{ name: string }>(
              scope.type === "variants"
                ? `SELECT p.name || CASE WHEN v.name='' THEN '' ELSE ' · ' || v.name END AS name
            FROM variants v JOIN products p ON p.id=v.product_id WHERE v.visible AND v.product_available
            AND v.id IN (SELECT value FROM json_each(?)) ORDER BY name`
                : `SELECT name FROM ${scope.type} WHERE ${scope.type === "products" ? "published AND visible" : "visible"}
            AND id IN (SELECT value FROM json_each(?)) ORDER BY name`,
              JSON.stringify(scope.ids),
            )
            .toArray()
            .map(({ name }) => name);
    return {
      id: offer.id,
      name,
      kind,
      code,
      scopeNames,
      discount,
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
