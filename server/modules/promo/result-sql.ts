// A late refund changes monetary results, but keeps the completed order and its original date.
const originalItems = "COALESCE(json_extract(o.snapshot,'$.itemsMinor'),0)";
export const netItems = `MAX(0,${originalItems}
  - COALESCE(json_extract(o.fulfillment_state,'$.finance.salesRefund.itemsMinor'),0)
  - COALESCE((SELECT SUM(value) FROM json_each(json_extract(o.fulfillment_state,'$.finance.salesRefund.variants'))),0))`;

const savedOfferAllocation = `(SELECT json_extract(part.value,'$.amount')
  FROM json_each(json_extract(o.snapshot,'$.adjustments')) offer, json_each(json_extract(offer.value,'$.allocations')) part
  WHERE json_extract(offer.value,'$.sourceId')=u.offer_id
    AND json_extract(part.value,'$.variantId')=json_extract(line.value,'$.variantId') LIMIT 1)`;
const lineSavings = `COALESCE(${savedOfferAllocation},CASE WHEN
  (SELECT COUNT(*) FROM json_each(json_extract(o.snapshot,'$.adjustments')) WHERE json_extract(value,'$.kind')='promotion')<=1
  THEN json_extract(line.value,'$.promoSavingsMinor') ELSE 0 END)`;

export const netSavings = `CASE WHEN json_extract(o.snapshot,'$.deliveryBenefit.offerId')=u.offer_id
  THEN MAX(0,u.amount_minor-COALESCE(json_extract(o.fulfillment_state,'$.finance.salesRefund.deliveryMinor'),0))
  WHEN ${netItems}=0 AND ${originalItems}>0 THEN 0
  WHEN json_extract(o.fulfillment_state,'$.finance.salesRefund') IS NULL THEN u.amount_minor
  ELSE MAX(0,u.amount_minor-COALESCE((
    SELECT SUM(CASE WHEN json_extract(line.value,'$.totalMinor')>0 THEN CAST(ROUND(
      CAST(${lineSavings} AS REAL)
      * MIN(json_extract(line.value,'$.totalMinor'),COALESCE((
        SELECT value FROM json_each(json_extract(o.fulfillment_state,'$.finance.salesRefund.variants'))
        WHERE key=json_extract(line.value,'$.variantId')
      ),0)) / json_extract(line.value,'$.totalMinor')) AS INTEGER) ELSE 0 END)
    FROM json_each(json_extract(o.snapshot,'$.lines')) line
    WHERE ${lineSavings}>0
  ),0)) END`;

export function completion(alias: "o" | "other", field: "created_at" | "id" = "created_at") {
  return `(SELECT e.${field} FROM buyer_order_events e WHERE e.order_number=${alias}.number
    AND e.event IN ('order.complete','order.markPickedUp') ORDER BY e.id DESC LIMIT 1)`;
}
