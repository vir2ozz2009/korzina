CREATE TABLE `staff_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`shop_id` text NOT NULL,
	`role` text NOT NULL,
	`permissions` text NOT NULL,
	`bot` text NOT NULL,
	`bot_username` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_by` text,
	`redemption_id` text,
	`revoked_at` integer,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_invitations_token_hash_unique` ON `staff_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `staff_invitations_shop_expiry_idx` ON `staff_invitations` (`shop_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `staff_invitations_expiry_idx` ON `staff_invitations` (`expires_at`);--> statement-breakpoint
ALTER TABLE `memberships` ADD `team_role` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `version` integer DEFAULT 0 NOT NULL;