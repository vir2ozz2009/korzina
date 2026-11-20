CREATE TABLE `seller_order_index` (
	`number` integer PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`method` text NOT NULL,
	`receiving_at` text NOT NULL,
	`created_at` integer NOT NULL,
	`name` text,
	`phone` text,
	`currency` text NOT NULL,
	`total_minor` integer NOT NULL,
	`payment_status` text NOT NULL,
	`packed` integer NOT NULL,
	`lines` integer NOT NULL,
	FOREIGN KEY (`number`) REFERENCES `orders`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `seller_orders_stage_time` ON `seller_order_index` (`stage`,`receiving_at`,`number`);--> statement-breakpoint
ALTER TABLE `buyer_order_events` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `buyer_order_events` ADD `details` text;--> statement-breakpoint
CREATE INDEX `buyer_order_events_number` ON `buyer_order_events` (`order_number`,`id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `fulfillment_state` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE VIEW seller_order_projection AS
SELECT number, status, COALESCE(json_extract(snapshot, '$.receiving.mode'), 'pickup') AS method,
  COALESCE(json_extract(snapshot, '$.time.date') || 'T' || COALESCE(substr(json_extract(snapshot, '$.time.slotId'), 1, 5), '23:59'), '') AS receiving_at,
  created_at, json_extract(snapshot, '$.customerName') AS name, json_extract(snapshot, '$.phone') AS phone,
  COALESCE(json_extract(snapshot, '$.currency'), '') AS currency, COALESCE(json_extract(snapshot, '$.totalMinor'), 0) AS total_minor,
  payment_status, COALESCE(json_array_length(fulfillment_state, '$.packed'), 0) AS packed,
  COALESCE(json_array_length(snapshot, '$.lines'), 0) AS lines
FROM orders;
--> statement-breakpoint
INSERT INTO seller_order_index SELECT * FROM seller_order_projection;
--> statement-breakpoint
DROP VIEW seller_order_projection;
--> statement-breakpoint
INSERT INTO settings(key, value) VALUES('seller_orders_revision', '0') ON CONFLICT(key) DO NOTHING;
--> statement-breakpoint
CREATE TRIGGER seller_order_inserted AFTER INSERT ON orders BEGIN
  INSERT INTO seller_order_index
  SELECT NEW.number, NEW.status, COALESCE(json_extract(NEW.snapshot, '$.receiving.mode'), 'pickup') AS method,
  COALESCE(json_extract(NEW.snapshot, '$.time.date') || 'T' || COALESCE(substr(json_extract(NEW.snapshot, '$.time.slotId'), 1, 5), '23:59'), '') AS receiving_at,
  NEW.created_at, json_extract(NEW.snapshot, '$.customerName') AS name, json_extract(NEW.snapshot, '$.phone') AS phone,
  COALESCE(json_extract(NEW.snapshot, '$.currency'), '') AS currency, COALESCE(json_extract(NEW.snapshot, '$.totalMinor'), 0) AS total_minor,
  NEW.payment_status, COALESCE(json_array_length(NEW.fulfillment_state, '$.packed'), 0) AS packed,
  COALESCE(json_array_length(NEW.snapshot, '$.lines'), 0) AS lines;
  UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='seller_orders_revision';
END;
--> statement-breakpoint
CREATE TRIGGER seller_order_updated AFTER UPDATE OF status,payment_status,proof_media_id,snapshot,fulfillment_state ON orders BEGIN
  INSERT OR REPLACE INTO seller_order_index
  SELECT NEW.number, NEW.status, COALESCE(json_extract(NEW.snapshot, '$.receiving.mode'), 'pickup') AS method,
  COALESCE(json_extract(NEW.snapshot, '$.time.date') || 'T' || COALESCE(substr(json_extract(NEW.snapshot, '$.time.slotId'), 1, 5), '23:59'), '') AS receiving_at,
  NEW.created_at, json_extract(NEW.snapshot, '$.customerName') AS name, json_extract(NEW.snapshot, '$.phone') AS phone,
  COALESCE(json_extract(NEW.snapshot, '$.currency'), '') AS currency, COALESCE(json_extract(NEW.snapshot, '$.totalMinor'), 0) AS total_minor,
  NEW.payment_status, COALESCE(json_array_length(NEW.fulfillment_state, '$.packed'), 0) AS packed,
  COALESCE(json_array_length(NEW.snapshot, '$.lines'), 0) AS lines;
  UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='seller_orders_revision';
END;
