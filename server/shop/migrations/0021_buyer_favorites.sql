CREATE TABLE `buyer_favorites` (
	`customer` text NOT NULL,
	`product_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`customer`, `product_id`)
);
--> statement-breakpoint
CREATE INDEX `buyer_favorites_recent` ON `buyer_favorites` (`customer`,`added_at`,`product_id`);