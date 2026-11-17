ALTER TABLE `carts` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `carts_updated_idx` ON `carts` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idempotency_created_idx` ON `idempotency` (`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `sessions_subject_idx` ON `sessions` (`subject`,`expires_at`);
--> statement-breakpoint
UPDATE carts SET updated_at=unixepoch()*1000 WHERE updated_at=0;
