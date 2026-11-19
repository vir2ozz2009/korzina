CREATE TABLE `customer_telegram_exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`telegram_subject` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_telegram_exchange_expiry` ON `customer_telegram_exchanges` (`expires_at`);--> statement-breakpoint
ALTER TABLE `carts` ADD `phone` text;