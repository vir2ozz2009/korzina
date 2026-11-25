ALTER TABLE carts ADD COLUMN promo_code TEXT;
--> statement-breakpoint
ALTER TABLE carts ADD COLUMN promo_alternative TEXT;
--> statement-breakpoint
ALTER TABLE variants ADD COLUMN promo_starts_at INTEGER;
--> statement-breakpoint
ALTER TABLE variants ADD COLUMN promo_ends_at INTEGER;
--> statement-breakpoint
CREATE TABLE promo_offers (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('draft','published','disabled')),
  kind TEXT NOT NULL CHECK(kind IN ('automatic','code')),
  code TEXT,
  starts_at INTEGER,
  ends_at INTEGER,
  terms TEXT NOT NULL,
  actor TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX promo_active_idx ON promo_offers(state,kind,code,ends_at,starts_at);
--> statement-breakpoint
CREATE TABLE promo_uses (
  order_number INTEGER PRIMARY KEY NOT NULL REFERENCES orders(number) ON DELETE CASCADE,
  offer_id TEXT NOT NULL REFERENCES promo_offers(id),
  customer TEXT,
  purchase_number INTEGER,
  amount_minor INTEGER NOT NULL,
  released_at INTEGER
);
--> statement-breakpoint
CREATE INDEX promo_offer_uses_idx ON promo_uses(offer_id,customer) WHERE released_at IS NULL;
--> statement-breakpoint
CREATE INDEX promo_reporting_idx ON promo_uses(offer_id,order_number);
--> statement-breakpoint
CREATE UNIQUE INDEX promo_purchase_right_idx ON promo_uses(customer,purchase_number)
  WHERE released_at IS NULL AND purchase_number IS NOT NULL;
--> statement-breakpoint
CREATE INDEX promo_completed_customer_idx ON orders(customer,number) WHERE status='completed';
