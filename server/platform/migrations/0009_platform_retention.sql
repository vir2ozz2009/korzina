CREATE INDEX `invitations_expiry_idx` ON `invitations` (`expires_at`);--> statement-breakpoint
CREATE INDEX `invitations_shop_idx` ON `invitations` (`shop_id`);