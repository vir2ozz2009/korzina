CREATE TABLE `checkout_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`customer` text NOT NULL,
	`snapshot` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `checkout_quote_expiry` ON `checkout_quotes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `checkout_receipts` (
	`media_id` text PRIMARY KEY NOT NULL,
	`customer` text NOT NULL,
	`quoted_total_minor` integer NOT NULL,
	`payment_settings` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `checkout_receipt_expiry` ON `checkout_receipts` (`expires_at`);--> statement-breakpoint
CREATE TABLE `order_outbox` (
	`order_number` integer PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_number`) REFERENCES `orders`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`payment_status` text NOT NULL,
	`proof_media_id` text,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_customer_number` ON `orders` (`customer`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_proof_once` ON `orders` (`proof_media_id`);