CREATE TABLE order_chat (
  order_number INTEGER PRIMARY KEY REFERENCES orders(number) ON DELETE CASCADE,
  last_at INTEGER NOT NULL,
  last_preview TEXT NOT NULL,
  waiting INTEGER NOT NULL DEFAULT 0,
  buyer_seen INTEGER NOT NULL DEFAULT 0,
  seller_seen INTEGER NOT NULL DEFAULT 0,
  buyer_unread INTEGER NOT NULL DEFAULT 0,
  seller_unread INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX order_chat_seller_list ON order_chat ((seller_unread>0) DESC, last_at DESC, order_number DESC);
--> statement-breakpoint
CREATE INDEX order_chat_message_order ON buyer_order_events(order_number, id)
WHERE event IN ('chat.buyer','chat.seller');
--> statement-breakpoint
CREATE INDEX order_chat_message_rate ON buyer_order_events(order_number, actor, created_at)
WHERE event IN ('chat.buyer','chat.seller');
--> statement-breakpoint
CREATE UNIQUE INDEX order_chat_unique_photo ON buyer_order_events(json_extract(details,'$.mediaId'))
WHERE event IN ('chat.buyer','chat.seller') AND json_extract(details,'$.mediaId') IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER order_chat_project AFTER INSERT ON buyer_order_events
WHEN NEW.event IN ('chat.buyer','chat.seller','order.accept','order.markReady','order.handOver','order.markPickedUp',
'order.complete','order.cancel','order.cancelled','order.recordPayment','composition.proposed','composition.applied',
'composition.answered','composition.expired','time.pending','time.accepted','time.withdrawn','time.kept') BEGIN
  INSERT INTO order_chat(order_number,last_at,last_preview,waiting,buyer_unread,seller_unread)
  VALUES(NEW.order_number,NEW.created_at,
    CASE WHEN NEW.event IN ('chat.buyer','chat.seller')
      THEN 'message:'||COALESCE(substr(json_extract(NEW.details,'$.text'),1,120),'Фото') ELSE NEW.event END,
    NEW.event='chat.buyer', NEW.event='chat.seller', NEW.event='chat.buyer')
  ON CONFLICT(order_number) DO UPDATE SET last_at=excluded.last_at,last_preview=excluded.last_preview,
    waiting=excluded.waiting, buyer_unread=buyer_unread+excluded.buyer_unread, seller_unread=seller_unread+excluded.seller_unread;
END;
