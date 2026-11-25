import { z } from "zod";
import type { PromoOffer } from "../../../src/shared/contracts/promo";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { datesFor } from "./offers";

export const reportInput = z.object({
  from: z.iso.date().optional(),
  through: z.iso.date().optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
const completion = `(SELECT e.created_at FROM buyer_order_events e WHERE e.order_number=o.number
  AND e.event IN ('order.complete','order.markPickedUp') ORDER BY e.id DESC LIMIT 1)`;
const window = `FROM promo_uses u JOIN orders o ON o.number=u.order_number
  WHERE u.offer_id=? AND o.status='completed' AND ${completion}>=? AND ${completion}<?`;
const items = `MAX(0, COALESCE(json_extract(o.snapshot,'$.itemsMinor'),0)
  - COALESCE(json_extract(o.fulfillment_state,'$.finance.salesRefund.itemsMinor'),0)
  - COALESCE((SELECT SUM(value) FROM json_each(json_extract(o.fulfillment_state,'$.finance.salesRefund.variants'))),0))`;
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
    .exec<{ orders: number; customers: number; guestOrders: number; itemsMinor: number; savingsMinor: number }>(
      `SELECT COUNT(*) orders,COUNT(DISTINCT u.customer) customers,COUNT(CASE WHEN u.customer IS NULL THEN 1 END) guestOrders,
      COALESCE(SUM(${items}),0) itemsMinor,COALESCE(SUM(u.amount_minor),0) savingsMinor ${window}`,
      ...params,
    )
    .one();
  const orders = storage.sql
    .exec<{ number: number; completedAt: number; name: string; itemsMinor: number; savingMinor: number }>(
      `SELECT o.number, ${completion} completedAt, COALESCE(json_extract(o.snapshot,'$.customerName'),'Гость') name,
      ${items} itemsMinor,u.amount_minor savingMinor ${window} ORDER BY completedAt DESC,o.number DESC LIMIT 31 OFFSET ?`,
      ...params,
      input.offset,
    )
    .toArray();
  return {
    ...summary,
    orders: orders.slice(0, 30),
    orderCount: summary.orders,
    nextOffset: orders.length > 30 ? input.offset + 30 : null,
  };
}
