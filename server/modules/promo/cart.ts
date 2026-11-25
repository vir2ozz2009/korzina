import type { Cart, CartAdjustment } from "../../../src/shared/contracts/cart";
import { formatMinor } from "../../../src/shared/money";
import { type Buyer, type Candidate, calculatePromo, promoLabel } from "./calculate";
import { type OfferRow, offerOf } from "./offers";

export type PromoSelection = { code: string | null; alternative: string | null };

function context(
  storage: DurableObjectStorage,
  subject: string,
  confirmed: boolean,
  codes: PromoSelection,
  now: number,
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
    .exec<OfferRow>(
      `SELECT p.*, COUNT(u.order_number) AS used, COUNT(CASE WHEN u.customer=? THEN 1 END) AS personal_used
     FROM promo_offers p LEFT JOIN promo_uses u ON u.offer_id=p.id AND u.released_at IS NULL
     WHERE (p.kind='automatic' AND p.state='published' AND (p.ends_at IS NULL OR p.ends_at>?))
        OR (p.kind='code' AND p.code IN (?,?) AND p.state<>'draft')
     GROUP BY p.id
     ORDER BY (p.state='published' AND COALESCE(p.starts_at,0)<=? AND COALESCE(p.ends_at,9007199254740991)>?) DESC,
      p.updated_at DESC,p.id`,
      confirmed ? subject : null,
      now,
      codes.code,
      codes.alternative,
      now,
      now,
    )
    .toArray();
  const candidates: Candidate[] = rows.map((row) => ({ ...offerOf(row, now), personalUsed: row.personal_used }));
  const nextChangeAt = rows
    .flatMap((row) => [row.starts_at, row.ends_at])
    .filter((at): at is number => at !== null && at > now)
    .sort((a, b) => a - b)[0];
  return { buyer, candidates, nextChangeAt };
}

export function pricePromoCart(
  storage: DurableObjectStorage,
  subject: string,
  confirmed: boolean,
  cart: Cart,
  codes: PromoSelection,
  now = Date.now(),
) {
  if (!cart.currency) return cart;
  const { buyer, candidates, nextChangeAt } = context(storage, subject, confirmed, codes, now);
  const label = (terms: Candidate["terms"]) => promoLabel(terms, (value) => formatMinor(value, cart.currency ?? "RUB"));
  const priced = calculatePromo(cart, candidates, buyer, label, codes.code ?? undefined);
  if (priced.promo) {
    if (nextChangeAt) priced.promo.nextChangeAt = nextChangeAt;
    if (codes.alternative) {
      const alternate = calculatePromo(cart, candidates, buyer, label, codes.alternative);
      priced.promo.alternative = { code: codes.alternative, totalMinor: alternate.totalMinor };
    }
  }
  return priced;
}

export function consumePromotion(
  storage: DurableObjectStorage,
  number: number,
  adjustments: CartAdjustment[] | undefined,
  customer: string | null,
) {
  const winner = adjustments?.find((item) => item.kind === "promotion");
  if (!winner) return;
  storage.sql.exec(
    "INSERT INTO promo_uses(order_number,offer_id,customer,purchase_number,amount_minor) VALUES(?,?,?,?,?)",
    number,
    winner.sourceId,
    customer,
    winner.purchase?.mode === "exact" ? winner.purchase.number : null,
    -winner.amount,
  );
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
