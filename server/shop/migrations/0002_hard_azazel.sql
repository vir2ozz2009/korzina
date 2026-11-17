CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`kind` text NOT NULL,
	`expires_at` integer NOT NULL
);
