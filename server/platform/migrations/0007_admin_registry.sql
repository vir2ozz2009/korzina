CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `platform_admins`(`account_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_sessions_expiry_idx` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `platform_admins` (
	`account_id` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platform_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`changed` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `platform_audit_created_idx` ON `platform_audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `platform_commands` (
	`account_id` text NOT NULL,
	`key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `key`)
);
--> statement-breakpoint
CREATE INDEX `platform_commands_created_idx` ON `platform_commands` (`created_at`);--> statement-breakpoint
CREATE TABLE `platform_order_events` (
	`shop_id` text NOT NULL,
	`order_number` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`shop_id`, `order_number`),
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `platform_order_events_date_idx` ON `platform_order_events` (`created_at`,`shop_id`);--> statement-breakpoint
ALTER TABLE `invitations` ADD `link_id` text;--> statement-breakpoint
ALTER TABLE `invitations` ADD `platform_allowed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `used_by` text;--> statement-breakpoint
ALTER TABLE `invitations` ADD `revoked_at` integer;--> statement-breakpoint
ALTER TABLE `invitations` ADD `replacement_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_link_id_unique` ON `invitations` (`link_id`);--> statement-breakpoint
ALTER TABLE `shops` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shops` ADD `country` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `currency` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `time_zone` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `theme` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `bot_username` text;
