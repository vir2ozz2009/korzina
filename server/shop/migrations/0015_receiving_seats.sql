CREATE TABLE `receiving_seats` (
	`method` text NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`booked` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`method`, `date`, `slot`)
);
--> statement-breakpoint
CREATE INDEX `receiving_seats_expiry` ON `receiving_seats` (`expires_at`);