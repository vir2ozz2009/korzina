CREATE TABLE `buyer_order_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` integer NOT NULL,
	`actor` text NOT NULL,
	`event` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_number`) REFERENCES `orders`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `buyer_order_revisions` (
	`customer` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_receipt_history` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` integer NOT NULL,
	`media_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_number`) REFERENCES `orders`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_receipts_number` ON `order_receipt_history` (`order_number`,`sequence`);--> statement-breakpoint
ALTER TABLE `orders` ADD `version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER buyer_order_changed AFTER UPDATE OF status, payment_status, proof_media_id, customer ON orders BEGIN
  INSERT INTO buyer_order_revisions(customer, revision) VALUES(NEW.customer, 1)
  ON CONFLICT(customer) DO UPDATE SET revision=revision+1;
  INSERT INTO buyer_order_revisions(customer, revision) SELECT OLD.customer, 1 WHERE OLD.customer != NEW.customer
  ON CONFLICT(customer) DO UPDATE SET revision=revision+1;
END;
