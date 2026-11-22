CREATE TABLE workday_notice (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  order_number INTEGER,
  recipient TEXT,
  product TEXT,
  variant TEXT,
  remaining INTEGER,
  expires_at INTEGER NOT NULL,
  expanded INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX workday_notice_pending ON workday_notice(expires_at) WHERE expanded=0;
--> statement-breakpoint
CREATE TABLE workday_notice_delivery (
  event TEXT NOT NULL REFERENCES workday_notice(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  outcome TEXT,
  PRIMARY KEY(event,recipient)
);
--> statement-breakpoint
CREATE INDEX workday_notice_due ON workday_notice_delivery(due_at) WHERE outcome IS NULL;
--> statement-breakpoint
CREATE INDEX workday_notice_expiry ON workday_notice(expires_at);
--> statement-breakpoint
CREATE TRIGGER workday_notice_initial_receipt AFTER INSERT ON orders
WHEN NEW.payment_status='pending_review' AND NEW.proof_media_id IS NOT NULL BEGIN
  INSERT OR IGNORE INTO workday_notice(id,kind,order_number,expires_at)
  VALUES('receipt:'||NEW.number||':'||NEW.proof_media_id,'receipt',NEW.number,unixepoch('subsec')*1000+86400000);
END;
--> statement-breakpoint
CREATE TRIGGER workday_notice_replacement_receipt AFTER UPDATE OF proof_media_id ON orders
WHEN NEW.payment_status='pending_review' AND NEW.proof_media_id IS NOT NULL
  AND NEW.proof_media_id IS NOT OLD.proof_media_id BEGIN
  INSERT OR IGNORE INTO workday_notice(id,kind,order_number,expires_at)
  VALUES('receipt:'||NEW.number||':'||NEW.proof_media_id,'receipt',NEW.number,unixepoch('subsec')*1000+86400000);
END;
--> statement-breakpoint
CREATE TRIGGER workday_notice_cancelled AFTER UPDATE OF status ON orders
WHEN NEW.status='cancelled' AND OLD.status<>'cancelled' BEGIN
  INSERT OR IGNORE INTO workday_notice(id,kind,order_number,expires_at)
  VALUES('cancellation:'||NEW.number,'cancellation',NEW.number,unixepoch('subsec')*1000+86400000);
END;
--> statement-breakpoint
CREATE TRIGGER workday_notice_buyer_stage AFTER UPDATE OF status ON orders
WHEN NEW.status<>OLD.status AND json_extract(NEW.snapshot,'$.telegramLinked')=1
  AND NEW.customer GLOB 'telegram:[0-9]*' AND substr(NEW.customer,10) NOT GLOB '*[^0-9]*'
  AND (
    (NEW.status='accepted' AND OLD.status='placed') OR
    (NEW.status='handed' AND OLD.status='ready' AND json_extract(NEW.snapshot,'$.receiving.mode')='delivery') OR
    (NEW.status='ready' AND OLD.status='accepted' AND json_extract(NEW.snapshot,'$.receiving.mode')='pickup') OR
    NEW.status IN ('completed','cancelled')
  ) BEGIN
  INSERT OR IGNORE INTO workday_notice(id,kind,order_number,recipient,expires_at)
  SELECT 'stage:'||NEW.number||':'||NEW.status,NEW.status,NEW.number,substr(NEW.customer,10),unixepoch('subsec')*1000+86400000
  WHERE NOT EXISTS (
    SELECT 1 FROM buyer_order_events WHERE order_number=NEW.number
    AND json_extract(details,'$.to')=NEW.status AND event<>'order.rollback'
  );
END;
--> statement-breakpoint
CREATE TRIGGER workday_notice_stock AFTER UPDATE OF stock ON variants
WHEN OLD.stock>5 AND NEW.stock<=5 AND NEW.visible=1 BEGIN
  INSERT INTO workday_notice(id,kind,product,variant,remaining,expires_at)
  SELECT 'stock:'||lower(hex(randomblob(16))),'stock',p.name,
    CASE WHEN (SELECT count(*) FROM variants WHERE product_id=p.id AND visible=1)>1 THEN NEW.name END,
    NEW.stock,unixepoch('subsec')*1000+86400000
  FROM products p WHERE p.id=NEW.product_id AND p.published=1 AND p.visible=1;
END;
