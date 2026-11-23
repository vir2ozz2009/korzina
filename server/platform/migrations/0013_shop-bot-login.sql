ALTER TABLE `seller_exchanges` ADD `shop_id` text;--> statement-breakpoint
ALTER TABLE `seller_exchanges` ADD `bot_id` text;--> statement-breakpoint
ALTER TABLE `seller_sessions` ADD `shop_id` text;--> statement-breakpoint
DELETE FROM seller_exchanges WHERE shop_id IS NULL;--> statement-breakpoint
DELETE FROM seller_sessions WHERE shop_id IS NULL
  AND account_id IN (SELECT id FROM accounts WHERE telegram_id IS NOT NULL);
