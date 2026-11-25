// A late refund changes monetary results, but keeps the completed order and its original date.
const originalItems = "COALESCE(json_extract(o.snapshot,'$.itemsMinor'),0)";
export const netItems = `MAX(0,${originalItems}
  - COALESCE(json_extract(o.fulfillment_state,'$.finance.salesRefund.itemsMinor'),0)
  - COALESCE((SELECT SUM(value) FROM json_each(json_extract(o.fulfillment_state,'$.finance.salesRefund.variants'))),0))`;

export const netSavings = `CASE WHEN ${netItems}=0 AND ${originalItems}>0 THEN 0
  WHEN json_extract(o.fulfillment_state,'$.finance.salesRefund') IS NULL THEN u.amount_minor
  ELSE MAX(0,u.amount_minor-COALESCE((
    SELECT SUM(CASE WHEN json_extract(line.value,'$.totalMinor')>0 THEN CAST(ROUND(
      CAST(json_extract(line.value,'$.promoSavingsMinor') AS REAL)
      * MIN(json_extract(line.value,'$.totalMinor'),COALESCE((
        SELECT value FROM json_each(json_extract(o.fulfillment_state,'$.finance.salesRefund.variants'))
        WHERE key=json_extract(line.value,'$.variantId')
      ),0)) / json_extract(line.value,'$.totalMinor')) AS INTEGER) ELSE 0 END)
    FROM json_each(json_extract(o.snapshot,'$.lines')) line
    WHERE json_extract(line.value,'$.promoSavingsMinor')>0
  ),0)) END`;

export function completion(alias: "o" | "other", field: "created_at" | "id" = "created_at") {
  return `(SELECT e.${field} FROM buyer_order_events e WHERE e.order_number=${alias}.number
    AND e.event IN ('order.complete','order.markPickedUp') ORDER BY e.id DESC LIMIT 1)`;
}
