CREATE TABLE `feature_overrides` (
	`shop_id` text NOT NULL,
	`key` text NOT NULL,
	`enabled` integer NOT NULL,
	PRIMARY KEY(`shop_id`, `key`),
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
