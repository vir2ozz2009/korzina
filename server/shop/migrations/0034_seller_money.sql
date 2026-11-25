CREATE TABLE seller_money_operations (
  id INTEGER PRIMARY KEY REFERENCES buyer_order_events(id) ON DELETE CASCADE,
  number INTEGER NOT NULL REFERENCES orders(number) ON DELETE CASCADE,
  occurred_at INTEGER NOT NULL,
  currency TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('received', 'returned')),
  amount_minor INTEGER,
  method TEXT CHECK (method IN ('cash', 'transfer'))
);
--> statement-breakpoint
CREATE INDEX seller_money_period ON seller_money_operations(currency, occurred_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX seller_money_order ON seller_money_operations(number, kind, id DESC);
--> statement-breakpoint
INSERT INTO seller_money_operations(id, number, occurred_at, currency, kind, amount_minor, method)
SELECT e.id, o.number, e.created_at, i.currency,
  CASE WHEN e.event='order.markRefundReturned' THEN 'returned' ELSE 'received' END,
  CASE WHEN e.event='order.markRefundReturned' THEN json_extract(e.details, '$.amountMinor') END,
  CASE WHEN e.event='order.confirmTransfer' THEN 'transfer' END
FROM buyer_order_events e
JOIN orders o ON o.number=e.order_number
JOIN seller_order_index i ON i.number=o.number
WHERE e.event IN ('order.recordPayment', 'order.confirmTransfer', 'order.markRefundReturned');
--> statement-breakpoint
WITH known AS (
  SELECT m.id,
    json_extract(o.fulfillment_state,'$.finance.latestPayment.amountMinor') AS amount,
    json_extract(o.fulfillment_state,'$.finance.latestPayment.method') AS method
  FROM orders o JOIN seller_money_operations m ON m.number=o.number AND m.kind='received'
  WHERE json_extract(o.fulfillment_state,'$.finance.paidMinor')=json_extract(o.fulfillment_state,'$.finance.latestPayment.amountMinor')
    AND NOT EXISTS(SELECT 1 FROM seller_money_operations other WHERE other.number=o.number AND other.kind='received' AND other.id!=m.id)
)
UPDATE seller_money_operations SET amount_minor=known.amount,method=known.method
FROM known WHERE seller_money_operations.id=known.id AND known.amount>0 AND known.method IN ('cash','transfer');
--> statement-breakpoint
CREATE TABLE seller_money_unknown_history (
  currency TEXT PRIMARY KEY,
  through INTEGER NOT NULL
) WITHOUT ROWID;
--> statement-breakpoint
INSERT INTO seller_money_unknown_history(currency, through)
SELECT i.currency, unixepoch('subsec')*1000
FROM orders o JOIN seller_order_index i USING(number)
WHERE (o.payment_status='confirmed' OR json_extract(o.fulfillment_state, '$.finance.paidMinor')>0)
  AND NOT EXISTS (
    SELECT 1 FROM seller_money_operations m WHERE m.number=o.number AND m.kind='received'
  )
GROUP BY i.currency;
--> statement-breakpoint
CREATE INDEX seller_money_pending ON seller_order_index(currency,created_at,number)
WHERE payment_status='pending_review' AND stage!='cancelled';
--> statement-breakpoint
CREATE INDEX seller_money_debt ON seller_order_index(currency,created_at,number) WHERE debt_minor>0;
--> statement-breakpoint
CREATE INDEX seller_money_refund ON seller_order_index(currency,created_at,number) WHERE refund_minor>0;
--> statement-breakpoint
CREATE VIEW seller_money_tasks AS
SELECT i.currency,i.number,'review' AS kind,
  MAX(0,i.total_minor-COALESCE(json_extract(o.fulfillment_state,'$.finance.paidMinor'),0)
                    +COALESCE(json_extract(o.fulfillment_state,'$.finance.returnedMinor'),0)
                    -COALESCE(json_extract(o.fulfillment_state,'$.finance.waivedMinor'),0)) AS amount,
  COALESCE(m.created_at,i.created_at) AS at,1 AS needs_seller,0 AS details_ready
FROM seller_order_index i JOIN orders o USING(number) LEFT JOIN media m ON m.id=o.proof_media_id
WHERE i.payment_status='pending_review' AND i.stage!='cancelled'
UNION ALL
SELECT i.currency,i.number,
  CASE WHEN json_extract(o.fulfillment_state,'$.topUp.status')='pending_review' THEN 'review' ELSE 'topUp' END,
  i.debt_minor,COALESCE(m.created_at,i.created_at),
  json_extract(o.fulfillment_state,'$.topUp.status') IS 'pending_review',0
FROM seller_order_index i JOIN orders o USING(number)
LEFT JOIN media m ON m.id=json_extract(o.fulfillment_state,'$.topUp.proof')
WHERE i.debt_minor>0 AND i.stage!='cancelled' AND i.payment_status!='pending_review'
UNION ALL
SELECT i.currency,i.number,'refund',i.refund_minor,
  COALESCE(json_extract(o.fulfillment_state,'$.finance.refund.detailsAt'), i.created_at),
  CASE WHEN json_extract(o.fulfillment_state,'$.finance.refund.detailsAt') IS NOT NULL
    OR COALESCE(json_extract(o.fulfillment_state,'$.finance.latestPayment.method'),json_extract(o.snapshot,'$.payment'))='cash' THEN 1 ELSE 0 END,
  json_extract(o.fulfillment_state,'$.finance.refund.detailsAt') IS NOT NULL
FROM seller_order_index i JOIN orders o USING(number) WHERE i.refund_minor>0;
