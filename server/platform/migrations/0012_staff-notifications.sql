CREATE TABLE `staff_bot_chats` (
	`shop_id` text NOT NULL,
	`account_id` text NOT NULL,
	`bot` text NOT NULL,
	PRIMARY KEY(`shop_id`, `account_id`, `bot`),
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `staff_role_notifications` (
	`shop_id` text NOT NULL,
	`role` text NOT NULL,
	`topic` text NOT NULL,
	`enabled` integer NOT NULL,
	PRIMARY KEY(`shop_id`, `role`, `topic`),
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
