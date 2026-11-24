CREATE TABLE sales_orders (
  number INTEGER PRIMARY KEY,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  day TEXT,
  hour INTEGER,
  currency TEXT NOT NULL,
  revenue_minor INTEGER,
  incomplete INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX sales_orders_period ON sales_orders(currency, day, created_at);
--> statement-breakpoint
CREATE INDEX sales_orders_completed ON sales_orders(completed_at, number);
--> statement-breakpoint
CREATE TABLE sales_totals (
  currency TEXT NOT NULL,
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  revenue_minor INTEGER NOT NULL,
  order_count INTEGER NOT NULL,
  positive_orders INTEGER NOT NULL,
  unknown_orders INTEGER NOT NULL,
  PRIMARY KEY(currency, day, hour)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE sales_lines (
  number INTEGER NOT NULL REFERENCES sales_orders(number) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  day TEXT NOT NULL,
  currency TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  revenue_minor INTEGER NOT NULL,
  incomplete INTEGER NOT NULL,
  PRIMARY KEY(number, position)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX sales_lines_period ON sales_lines(currency, day, product_id);
--> statement-breakpoint
CREATE INDEX sales_lines_product ON sales_lines(product_id, currency, day, variant_id);
--> statement-breakpoint
CREATE INDEX sales_completion_events ON buyer_order_events(order_number, id DESC)
WHERE event IN ('order.complete', 'order.markPickedUp');
--> statement-breakpoint
CREATE TABLE sales_products_daily (
  currency TEXT NOT NULL,
  day TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  PRIMARY KEY(currency,day,product_id)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TRIGGER sales_product_added AFTER INSERT ON sales_lines BEGIN
  INSERT INTO sales_products_daily VALUES(NEW.currency,NEW.day,NEW.product_id,NEW.name,NEW.quantity)
    ON CONFLICT(currency,day,product_id) DO UPDATE SET quantity=quantity+excluded.quantity, name=excluded.name;
END;
--> statement-breakpoint
CREATE TRIGGER sales_product_removed AFTER DELETE ON sales_lines BEGIN
  UPDATE sales_products_daily SET quantity=quantity-OLD.quantity
    WHERE currency=OLD.currency AND day=OLD.day AND product_id=OLD.product_id;
  DELETE FROM sales_products_daily WHERE currency=OLD.currency AND day=OLD.day AND product_id=OLD.product_id AND quantity=0;
END;
--> statement-breakpoint
CREATE INDEX sales_totals_daily ON sales_totals(currency,day) WHERE hour=-1;
--> statement-breakpoint
CREATE INDEX sales_orders_by_day ON sales_orders(day,number) WHERE day IS NOT NULL;
