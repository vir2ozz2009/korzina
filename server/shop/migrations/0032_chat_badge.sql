INSERT INTO settings(key,value)
SELECT 'seller_chat_unread', COALESCE(SUM(seller_unread),0) FROM order_chat WHERE true
ON CONFLICT(key) DO NOTHING;
--> statement-breakpoint
CREATE TRIGGER order_chat_badge_insert AFTER INSERT ON order_chat WHEN NEW.seller_unread>0 BEGIN
  UPDATE settings SET value=CAST(value AS INTEGER)+NEW.seller_unread WHERE key='seller_chat_unread';
END;
--> statement-breakpoint
CREATE TRIGGER order_chat_badge_update AFTER UPDATE OF seller_unread ON order_chat
WHEN NEW.seller_unread<>OLD.seller_unread BEGIN
  UPDATE settings SET value=CAST(value AS INTEGER)+NEW.seller_unread-OLD.seller_unread WHERE key='seller_chat_unread';
END;
--> statement-breakpoint
CREATE TRIGGER order_chat_badge_delete AFTER DELETE ON order_chat WHEN OLD.seller_unread>0 BEGIN
  UPDATE settings SET value=CAST(value AS INTEGER)-OLD.seller_unread WHERE key='seller_chat_unread';
END;
