import { z } from "zod";
import type { PromoOffer } from "../../../src/shared/contracts/promo";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { datesFor } from "./offers";
import { completion, netItems, netSavings } from "./result-sql";

export const reportInput = z.object({
  from: z.iso.date().optional(),
  through: z.iso.date().optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
const completedAt = completion("o");
const filter = `FROM promo_uses u JOIN orders o ON o.number=u.order_number
  WHERE u.offer_id=? AND o.status='completed' AND u.amount_minor>0 AND ${completedAt}>=? AND ${completedAt}<?`;
type Filter = readonly [string, number, number];
const thirtyDays = 30 * 86_400_000;
const adjustment = (
  path: string,
) => `(SELECT json_extract(value,'${path}') FROM json_each(json_extract(o.snapshot,'$.adjustments'))
  WHERE json_extract(value,'$.sourceId')=u.offer_id LIMIT 1)`;
type PurchaseStats = {
  mode: "exact" | "from";
  target: number;
  buyers: number;
  matured: number;
  waiting: number;
  repeated: number;
};

function purchaseStats(storage: DurableObjectStorage, params: Filter, now: number) {
  const otherTime = completion("other");
  const otherEvent = completion("other", "id");
  return storage.sql
    .exec<PurchaseStats>(
      `WITH selected AS (
      SELECT u.customer,o.number,${completedAt} completedAt,${completion("o", "id")} eventId,
        ${adjustment("$.purchase.mode")} mode,${adjustment("$.purchase.number")} target
      ${filter} AND u.customer IS NOT NULL
    ), numbered AS (
      SELECT *, (SELECT COUNT(*) FROM orders other WHERE other.customer=selected.customer AND other.status='completed'
        AND (${otherTime}<selected.completedAt OR (${otherTime}=selected.completedAt AND ${otherEvent}<selected.eventId)))+1 actual
      FROM selected WHERE mode IS NOT NULL
    ), qualifying AS (
      SELECT * FROM numbered WHERE mode='from' OR actual=target
    )
    SELECT mode,target,COUNT(DISTINCT customer) buyers,
      COUNT(CASE WHEN mode='exact' AND target=1 AND completedAt<=? THEN 1 END) matured,
      COUNT(CASE WHEN mode='exact' AND target=1 AND completedAt>? THEN 1 END) waiting,
      COUNT(CASE WHEN mode='exact' AND target=1 AND completedAt<=? AND EXISTS(
        SELECT 1 FROM orders other WHERE other.customer=qualifying.customer AND other.status='completed'
          AND (${otherTime}>qualifying.completedAt OR (${otherTime}=qualifying.completedAt AND ${otherEvent}>qualifying.eventId))
          AND ${otherTime}<=qualifying.completedAt+?) THEN 1 END) repeated
    FROM qualifying GROUP BY mode,target ORDER BY target,mode`,
      ...params,
      now - thirtyDays,
      now - thirtyDays,
      now - thirtyDays,
      thirtyDays,
    )
    .toArray();
}

export function reportOffer(
  storage: DurableObjectStorage,
  offer: PromoOffer,
  input: z.infer<typeof reportInput>,
  zone = defaultShopTimeZone,
  now = Date.now(),
) {
  const { start, end } = datesFor({ fromDate: input.from, throughDate: input.through }, zone);
  const params = [offer.id, start ?? 0, Math.min(end ?? now + 1, now + 1)] as const;
  const summary = storage.sql
    .exec<{
      orders: number;
      customers: number;
      guestOrders: number;
      itemsMinor: number;
      savingsMinor: number;
      deliveryMinor: number;
      thresholdCount: number;
      thresholdAverage: number | null;
      groupCount: number;
      giftCount: number;
    }>(
      `SELECT COUNT(*) orders,COUNT(DISTINCT u.customer) customers,COUNT(CASE WHEN u.customer IS NULL THEN 1 END) guestOrders,
      COALESCE(SUM(${netItems}),0) itemsMinor,COALESCE(SUM(${netSavings}),0) savingsMinor,
      COALESCE(SUM(MAX(0,COALESCE(json_extract(o.snapshot,'$.deliveryMinor'),0)-
        COALESCE(json_extract(o.fulfillment_state,'$.finance.salesRefund.deliveryMinor'),0))),0) deliveryMinor,
      COALESCE(SUM(CASE WHEN ${netItems}>0 THEN COALESCE(${adjustment("$.groups.count")},0) ELSE 0 END),0) groupCount,
      COALESCE(SUM(CASE WHEN ${netItems}>0 THEN COALESCE((
        SELECT SUM(COALESCE(json_extract(part.value,'$.gifts'),0))
        FROM json_each(json_extract(o.snapshot,'$.adjustments')) offer,
          json_each(json_extract(offer.value,'$.allocations')) part
        WHERE json_extract(offer.value,'$.sourceId')=u.offer_id
      ),0) ELSE 0 END),0) giftCount,
      COUNT(${adjustment("$.minimumMinor")}) thresholdCount,
      CAST(ROUND(AVG(CASE WHEN ${adjustment("$.minimumMinor")} IS NOT NULL THEN ${netItems} END)) AS INTEGER) thresholdAverage
      ${filter}`,
      ...params,
    )
    .one();
  const orders = storage.sql
    .exec<{ number: number; completedAt: number; name: string; itemsMinor: number; savingMinor: number }>(
      `SELECT o.number, ${completedAt} completedAt, COALESCE(json_extract(o.snapshot,'$.customerName'),'Гость') name,
      ${netItems} itemsMinor,${netSavings} savingMinor ${filter} ORDER BY completedAt DESC,o.number DESC LIMIT 31 OFFSET ?`,
      ...params,
      input.offset,
    )
    .toArray();
  return {
    ...summary,
    orders: orders.slice(0, 30),
    orderCount: summary.orders,
    ...(offer.terms.group && {
      groups: {
        type: offer.terms.group.type,
        count: summary.groupCount,
        gifts: summary.giftCount,
        ...(offer.terms.group.type === "gift" && { label: `${offer.terms.group.buy}+${offer.terms.group.gift}` }),
      },
    }),
    nextOffset: orders.length > 30 ? input.offset + 30 : null,
    purchaseStats: summary.orders ? purchaseStats(storage, params, now) : [],
  };
}
