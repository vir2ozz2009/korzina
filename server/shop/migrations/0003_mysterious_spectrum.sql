CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text NOT NULL,
	`ready` integer DEFAULT false NOT NULL,
	`bytes` integer NOT NULL,
	`mime` text NOT NULL,
	`display` text DEFAULT 'photo' NOT NULL,
	`cutout` integer DEFAULT false NOT NULL,
	`request_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE INDEX `media_expiry_idx` ON `media` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_request_idx` ON `media` (`owner`,`request_key`);