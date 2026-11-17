CREATE TABLE `idempotency` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `key`)
);
