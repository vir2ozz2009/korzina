CREATE TABLE `domains` (
	`host` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shops` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`plan` text DEFAULT 'base' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shops_slug_unique` ON `shops` (`slug`);