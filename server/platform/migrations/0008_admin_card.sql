CREATE TABLE `shop_bots` (
	`shop_id` text PRIMARY KEY NOT NULL,
	`telegram_id` text,
	`username` text,
	`token` text,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shop_bots_telegram_id_unique` ON `shop_bots` (`telegram_id`);--> statement-breakpoint
ALTER TABLE `invitations` ADD `redeemed_id` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `owner_name` text;
--> statement-breakpoint
ALTER TABLE `shops` ADD `status_notice` text;
