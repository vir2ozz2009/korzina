CREATE TABLE `seller_exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`proof_hash` text NOT NULL,
	`telegram_id` text,
	`completed_with` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `seller_exchanges_expiry_idx` ON `seller_exchanges` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `memberships_account_idx` ON `memberships` (`account_id`);
