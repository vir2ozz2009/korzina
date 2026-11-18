CREATE TABLE `demo_seed_queue` (
	`shop_id` text PRIMARY KEY NOT NULL,
	`requested_at` text NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
