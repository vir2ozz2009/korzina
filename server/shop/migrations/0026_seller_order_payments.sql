CREATE TABLE `order_notification_outbox` (
	`event_key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`order_number` integer NOT NULL,
	`recipient` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`due_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`order_number`) REFERENCES `orders`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_notification_due` ON `order_notification_outbox` (`due_at`);--> statement-breakpoint
ALTER TABLE `seller_order_index` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_order_index` ADD `debt_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_order_index` ADD `refund_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_order_index` ADD `name_key` text;

--> statement-breakpoint
DROP TRIGGER seller_order_inserted;
--> statement-breakpoint
DROP TRIGGER seller_order_updated;
--> statement-breakpoint
INSERT INTO settings(key,value) VALUES('seller_notification_watermark', COALESCE((SELECT MAX(order_number) FROM order_outbox),0));
--> statement-breakpoint
CREATE TRIGGER seller_order_inserted AFTER INSERT ON orders BEGIN
  INSERT INTO seller_order_index(number,stage,method,receiving_at,created_at,name,phone,currency,total_minor,payment_status,packed,lines,revision,debt_minor,refund_minor,name_key)
  SELECT NEW.number, NEW.status, COALESCE(json_extract(NEW.snapshot, '$.receiving.mode'), 'pickup') AS method,
  COALESCE(json_extract(NEW.snapshot, '$.time.date') || 'T' || COALESCE(substr(json_extract(NEW.snapshot, '$.time.slotId'), 1, 5), '23:59'), '') AS receiving_at,
  NEW.created_at, json_extract(NEW.snapshot, '$.customerName') AS name, json_extract(NEW.snapshot, '$.phone') AS phone,
  COALESCE(json_extract(NEW.snapshot, '$.currency'), '') AS currency, COALESCE(json_extract(NEW.snapshot, '$.totalMinor'), 0) AS total_minor,
  NEW.payment_status, COALESCE(json_array_length(NEW.fulfillment_state, '$.packed'), 0) AS packed,
  COALESCE(json_array_length(NEW.snapshot, '$.lines'), 0) AS lines,
  NEW.version,
  CASE WHEN NEW.status='cancelled' THEN 0 ELSE COALESCE(json_extract(NEW.fulfillment_state, '$.debtMinor'),0) END,
  COALESCE(json_extract(NEW.fulfillment_state, '$.refundMinor'),0),
  json_extract(NEW.snapshot, '$.customerNameKey');
  UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='seller_orders_revision';
END;
--> statement-breakpoint
CREATE TRIGGER seller_order_updated AFTER UPDATE OF status,payment_status,proof_media_id,snapshot,fulfillment_state ON orders BEGIN
  INSERT OR REPLACE INTO seller_order_index(number,stage,method,receiving_at,created_at,name,phone,currency,total_minor,payment_status,packed,lines,revision,debt_minor,refund_minor,name_key)
  SELECT NEW.number, NEW.status, COALESCE(json_extract(NEW.snapshot, '$.receiving.mode'), 'pickup') AS method,
  COALESCE(json_extract(NEW.snapshot, '$.time.date') || 'T' || COALESCE(substr(json_extract(NEW.snapshot, '$.time.slotId'), 1, 5), '23:59'), '') AS receiving_at,
  NEW.created_at, json_extract(NEW.snapshot, '$.customerName') AS name, json_extract(NEW.snapshot, '$.phone') AS phone,
  COALESCE(json_extract(NEW.snapshot, '$.currency'), '') AS currency, COALESCE(json_extract(NEW.snapshot, '$.totalMinor'), 0) AS total_minor,
  NEW.payment_status, COALESCE(json_array_length(NEW.fulfillment_state, '$.packed'), 0) AS packed,
  COALESCE(json_array_length(NEW.snapshot, '$.lines'), 0) AS lines,
  NEW.version,
  CASE WHEN NEW.status='cancelled' THEN 0 ELSE COALESCE(json_extract(NEW.fulfillment_state, '$.debtMinor'),0) END,
  COALESCE(json_extract(NEW.fulfillment_state, '$.refundMinor'),0),
  json_extract(NEW.snapshot, '$.customerNameKey');
  UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='seller_orders_revision';
END;


--> statement-breakpoint
UPDATE seller_order_index SET revision=(SELECT version FROM orders WHERE number=seller_order_index.number);
--> statement-breakpoint
CREATE TABLE seller_live_tickets(ticket TEXT PRIMARY KEY, session_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX seller_live_expiry ON seller_live_tickets(expires_at);
