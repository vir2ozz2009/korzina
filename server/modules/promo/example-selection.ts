import type { PromoTerms } from "../../../src/shared/contracts/promo";
import type { FulfillmentSettings, Receiving } from "../../../src/shared/contracts/receiving";
import { addMinor, multiplyMinor } from "../../../src/shared/money";
import { effectivePrice } from "./cart";

// Read-only, bounded selection. Never borrows the seller's personal cart or addresses.
export function selectExample(storage: DurableObjectStorage, terms: PromoTerms, now: number) {
  const effective = effectivePrice("v.", true, now);
  const scope =
    terms.group?.type === "bundle"
      ? { type: "variants", ids: terms.group.components.map((part) => part.variantId) }
      : terms.scope;
  const rows = storage.sql
    .exec<{ id: string; price: number; stock: number | null }>(
      `SELECT v.id,${effective.price} AS price,v.stock FROM variants v JOIN products p ON p.id=v.product_id
     WHERE v.visible AND v.product_available AND NOT v.product_paused AND v.sale_pause IS NULL
     AND (v.stock IS NULL OR v.stock>0)
     AND (?='all' OR CASE ? WHEN 'variants' THEN v.id WHEN 'products' THEN p.id ELSE p.category_id END IN (SELECT value FROM json_each(?)))
     ${terms.kind === "code" && !terms.delivery && !terms.group ? `AND ${effective.old} IS NULL` : ""}
     ORDER BY ${terms.delivery ? "price * MIN(999,COALESCE(v.stock,999)) DESC," : ""} v.id LIMIT 250`,
      scope.type,
      scope.type,
      JSON.stringify("ids" in scope ? scope.ids : []),
    )
    .toArray();
  const selected: { variantId: string; quantity: number }[] = [];
  let sum = 0;
  let count = 0;
  const minimum = terms.minimumMinor ?? 0;
  const quantity = Math.max(
    1,
    terms.minimumQuantity ?? 0,
    terms.group?.type === "gift" ? terms.group.buy + terms.group.gift : 0,
  );
  for (const row of rows) {
    if (selected.length >= 50) break;
    const bundle =
      terms.group?.type === "bundle" ? terms.group.components.find((part) => part.variantId === row.id) : undefined;
    if (terms.group?.type === "bundle" && !bundle) continue;
    const needed =
      bundle?.quantity ?? Math.max(0, quantity - count, row.price > 0 ? Math.ceil((minimum - sum) / row.price) : 0);
    const take = Math.min(999, row.stock ?? 999, needed);
    if (take > 0) {
      selected.push({ variantId: row.id, quantity: take });
      sum = addMinor(sum, multiplyMinor(row.price, take));
      count += take;
    }
    if (!terms.group && sum >= minimum && count >= quantity) break;
  }
  const bundleMissing =
    terms.group?.type === "bundle" &&
    terms.group.components.some(
      (part) => !selected.some((line) => line.variantId === part.variantId && line.quantity >= part.quantity),
    );
  return {
    lines: selected,
    problem: !selected.length
      ? "Нет доступных товаров. Проверьте каталог."
      : sum < minimum || count < quantity || bundleMissing
        ? "Доступных товаров недостаточно для условий примера. Проверьте цены и остатки."
        : null,
  };
}

export function exampleReceiving(settings: FulfillmentSettings): Receiving | null {
  const delivery = settings.delivery;
  if (!delivery) return settings.pickup ? { mode: "pickup" } : null;
  const base = { mode: "delivery" as const, address: "Адрес в зоне доставки · пример" };
  if (delivery.mode === "text") return base;
  if (delivery.mode === "districts") return { ...base, districtId: delivery.districts[0]?.id };
  const geometry = delivery.zones[0]?.geometry;
  return geometry ? { ...base, point: geometry.type === "radius" ? geometry.center : geometry.points[0] } : null;
}
