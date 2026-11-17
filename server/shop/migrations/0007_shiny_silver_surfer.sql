CREATE TABLE `carts` (
	`customer` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`lines` text DEFAULT '[]' NOT NULL
);
