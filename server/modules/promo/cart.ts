import type { Cart, CartAdjustment } from "../../../src/shared/contracts/cart";
import type { DeliveryBenefit } from "../../../src/shared/contracts/promo";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { formatMinor } from "../../../src/shared/money";
import { currentSelection } from "../fulfillment/current-selection";
import { pauseStatus } from "../fulfillment/pause";
import { checkFulfillment, parseSelection, resolveFulfillment } from "../fulfillment/service";
import { type Buyer, type Candidate, calculatePromo, promoLabel } from "./calculate";
import { type DeliveryContext, deliveryContextFor } from "./delivery-calculation";
import { bundleComponents } from "./group-catalog";
import { type OfferRow, offerOf } from "./offers";

export type PromoSelection = { code: string | null; alternative: string | null };

export const automaticPromoWhere = (now: number | string) =>
  `p.state='published' AND (p.kind='automatic' OR
    (p.kind='code' AND json_extract(p.terms,'$.publicInCart')=1 AND json_extract(p.terms,'$.group.type')='bundle'))
    AND (p.ends_at IS NULL OR p.ends_at>${now})`;

export function promoContext(
  storage: DurableObjectStorage,
  subject: string,
  confirmed: boolean,
  codes: PromoSelection,
  now: number,
  publicOnly = false,
  offerId: string | null = null,
  withDeliveryContext = true,
) {
  let buyer: Buyer = { confirmed, completed: 0, exactUsed: false };
  if (confirmed) {
    const { completed, exact_used } = storage.sql
      .exec<{ completed: number; exact_used: number }>(
        `WITH history AS (SELECT COUNT(*) AS completed FROM orders WHERE customer=? AND status='completed')
       SELECT completed, EXISTS(SELECT 1 FROM promo_uses WHERE customer=? AND purchase_number=history.completed+1
       AND released_at IS NULL AND purchase_number IS NOT NULL) AS exact_used FROM history`,
        subject,
        subject,
      )
      .one();
    buyer = { confirmed, completed, exactUsed: !!exact_used };
  }
  const rows = storage.sql
    .exec<OfferRow & { delivery_settings: string | null; receiving: string | null }>(
      `SELECT p.*, ${withDeliveryContext ? "CASE WHEN json_extract(p.terms,'$.delivery')=1 THEN (SELECT value FROM settings WHERE key='fulfillment') END AS delivery_settings,CASE WHEN json_extract(p.terms,'$.delivery')=1 THEN (SELECT receiving FROM carts WHERE customer=?) END AS receiving," : "NULL AS delivery_settings,NULL AS receiving,"}COUNT(u.order_number) AS used, COUNT(CASE WHEN u.customer=? THEN 1 END) AS personal_used
     FROM promo_offers p LEFT JOIN promo_uses u ON u.offer_id=p.id AND u.released_at IS NULL
     WHERE ${
       publicOnly
         ? `p.state='published' AND json_extract(p.terms,'$.publicInCart')=1
       AND (p.starts_at IS NULL OR p.starts_at<=?) AND (p.ends_at IS NULL OR p.ends_at>?)
       AND (? IS NULL OR p.id=?)`
         : `(${automaticPromoWhere("?")})
        OR (p.kind='code' AND p.code IN (?,?) AND p.state<>'draft')`
     }
     GROUP BY p.id
     ORDER BY (p.state='published' AND COALESCE(p.starts_at,0)<=? AND COALESCE(p.ends_at,9007199254740991)>?) DESC,
      p.updated_at DESC,p.id`,
      ...(withDeliveryContext ? [subject] : []),
      confirmed ? subject : null,
      ...(publicOnly ? [now, now, offerId, offerId] : [now, codes.code, codes.alternative]),
      now,
      now,
    )
    .toArray();
  const candidates: Candidate[] = rows.map((row) => ({ ...offerOf(row, now), personalUsed: row.personal_used }));
  const nextChangeAt = rows
    .flatMap((row) => [row.starts_at, row.ends_at])
    .filter((at): at is number => at !== null && at > now)
    .sort((a, b) => a - b)[0];
  const context = rows.find((row) => row.delivery_settings);
  return { buyer, candidates, nextChangeAt, context };
}

export function pricePromoCart(
  storage: DurableObjectStorage,
  subject: string,
  confirmed: boolean,
  cart: Cart,
  codes: PromoSelection,
  now = Date.now(),
  hasAutomatic = true,
  source?: { maps?: boolean; timeZone?: string; deliveryContext?: DeliveryContext },
) {
  if (!cart.currency) return cart;
  // The cart state already checked this shop's indexed automatic offers. Keep the no-offer hot path in budget.
  const { buyer, candidates, nextChangeAt, context } =
    hasAutomatic || codes.code || codes.alternative
      ? promoContext(storage, subject, confirmed, codes, now, false, null, !source?.deliveryContext)
      : {
          buyer: { confirmed, completed: 0, exactUsed: false },
          candidates: [],
          nextChangeAt: undefined,
          context: undefined,
        };
  const settings = context && resolveFulfillment(context.delivery_settings, source?.maps ?? true);
  const receiving = settings && currentSelection(parseSelection(context.receiving), settings).receiving;
  const availability = settings && receiving ? checkFulfillment(settings, receiving) : null;
  const delivery =
    source?.deliveryContext ??
    (context
      ? deliveryContextFor(
          availability,
          !!settings && !!pauseStatus(settings, source?.timeZone ?? defaultShopTimeZone, now).unavailable.delivery,
        )
      : undefined);
  const label = (terms: Candidate["terms"]) => promoLabel(terms, (value) => formatMinor(value, cart.currency ?? "RUB"));
  const parts = cart.lines.length
    ? bundleComponents(
        storage,
        candidates.filter(
          ({ terms, status }) =>
            status === "active" &&
            (terms.kind === "automatic" ||
              terms.publicInCart ||
              terms.code === codes.code ||
              terms.code === codes.alternative),
        ),
        now,
      )
    : undefined;
  const priced = calculatePromo(cart, candidates, buyer, label, codes.code ?? undefined, parts, delivery);
  if (priced.promo) {
    const nextPriceAt = Math.min(
      ...cart.lines.flatMap((line) => (line.nextPriceAt ? [line.nextPriceAt] : [])),
      nextChangeAt ?? Infinity,
    );
    if (Number.isFinite(nextPriceAt)) priced.promo.nextChangeAt = nextPriceAt;
    if (codes.alternative) {
      const alternate = calculatePromo(cart, candidates, buyer, label, codes.alternative, parts, delivery);
      priced.promo.alternative = {
        code: codes.alternative,
        totalMinor: alternate.totalMinor,
        deliveryMinor: alternate.delivery?.feeMinor,
        reason: alternate.promo?.reason,
        missingMinor: alternate.promo?.missingMinor,
        missingQuantity: alternate.promo?.missingQuantity,
      };
    }
  }
  return priced;
}

export function consumePromotion(
  storage: DurableObjectStorage,
  number: number,
  adjustments: CartAdjustment[] | undefined,
  customer: string | null,
  delivery?: DeliveryBenefit,
) {
  const awards = [...(adjustments ?? [])];
  if (delivery && delivery.state !== "released")
    awards.push({ kind: "promotion", sourceId: delivery.offerId, label: delivery.name, amount: -delivery.amountMinor });
  for (const winner of awards?.filter((item) => item.kind === "promotion") ?? []) {
    storage.sql.exec(
      "INSERT INTO promo_uses(order_number,offer_id,customer,purchase_number,amount_minor) VALUES(?,?,?,?,?)",
      number,
      winner.sourceId,
      customer,
      winner.purchase?.mode === "exact" ? winner.purchase.number : null,
      -winner.amount,
    );
  }
}
export function releasePromotion(storage: DurableObjectStorage, number: number, now = Date.now()) {
  storage.sql.exec("UPDATE promo_uses SET released_at=? WHERE order_number=? AND released_at IS NULL", now, number);
}

export const effectivePrice = (alias: string, enabled: boolean, now: number) => {
  const window = enabled
    ? `(${alias}promo_starts_at IS NULL OR ${alias}promo_starts_at<=${Math.trunc(now)})
    AND (${alias}promo_ends_at IS NULL OR ${alias}promo_ends_at>${Math.trunc(now)})`
    : `${alias}promo_starts_at IS NULL AND ${alias}promo_ends_at IS NULL`;
  return {
    price: `CASE WHEN ${window} THEN ${alias}price_minor ELSE COALESCE(${alias}old_price_minor,${alias}price_minor) END`,
    old: `CASE WHEN ${window} AND ${alias}old_price_minor>${alias}price_minor THEN ${alias}old_price_minor END`,
  };
};
