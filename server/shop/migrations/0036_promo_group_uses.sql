ALTER TABLE promo_uses RENAME TO promo_uses_legacy;
--> statement-breakpoint
CREATE TABLE promo_uses (
  order_number INTEGER NOT NULL REFERENCES orders(number) ON DELETE CASCADE,
  offer_id TEXT NOT NULL REFERENCES promo_offers(id),
  customer TEXT,
  purchase_number INTEGER,
  amount_minor INTEGER NOT NULL,
  released_at INTEGER,
  PRIMARY KEY (order_number,offer_id)
);
--> statement-breakpoint
INSERT INTO promo_uses SELECT order_number,offer_id,customer,purchase_number,amount_minor,released_at
  FROM promo_uses_legacy;
--> statement-breakpoint
DROP TABLE promo_uses_legacy;
--> statement-breakpoint
CREATE INDEX promo_offer_uses_idx ON promo_uses(offer_id,customer) WHERE released_at IS NULL;
--> statement-breakpoint
CREATE INDEX promo_reporting_idx ON promo_uses(offer_id,order_number);
--> statement-breakpoint
CREATE UNIQUE INDEX promo_purchase_right_idx ON promo_uses(customer,purchase_number)
  WHERE released_at IS NULL AND purchase_number IS NOT NULL;
