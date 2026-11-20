ALTER TABLE catalog_state ADD seller_stock_version integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `ingredients` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `storage_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `sale_pause` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `recommendations` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `recommendation_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `products_sale_pause_idx` ON `products` (`sale_pause`) WHERE "products"."sale_pause">0;--> statement-breakpoint
ALTER TABLE `variants` ADD `stock_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `variants` ADD `purchased` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `variants` ADD `sale_pause` integer;--> statement-breakpoint
ALTER TABLE `variants` ADD `product_paused` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `variants_sale_pause_idx` ON `variants` (`sale_pause`) WHERE "variants"."sale_pause">0;--> statement-breakpoint
CREATE VIRTUAL TABLE seller_product_search USING fts5(product_id UNINDEXED, name, tokenize='unicode61 remove_diacritics 2', prefix='2 3');
--> statement-breakpoint
INSERT INTO seller_product_search SELECT id, replace(replace(name,'ё','е'),'Ё','Е') FROM products;
--> statement-breakpoint
CREATE TRIGGER seller_product_search_insert AFTER INSERT ON products BEGIN
  INSERT INTO seller_product_search VALUES (NEW.id, replace(replace(NEW.name,'ё','е'),'Ё','Е'));
END;
--> statement-breakpoint
CREATE TRIGGER seller_product_search_update AFTER UPDATE OF name ON products WHEN NEW.name IS NOT OLD.name BEGIN
  DELETE FROM seller_product_search WHERE product_id=OLD.id;
  INSERT INTO seller_product_search VALUES (NEW.id, replace(replace(NEW.name,'ё','е'),'Ё','Е'));
END;
--> statement-breakpoint
CREATE TRIGGER seller_product_search_delete AFTER DELETE ON products BEGIN
  DELETE FROM seller_product_search WHERE product_id=OLD.id;
END;
--> statement-breakpoint
DROP TRIGGER variants_catalog_price_insert;
--> statement-breakpoint
DROP TRIGGER variants_catalog_price_delete;
--> statement-breakpoint
DROP TRIGGER variants_catalog_price_update;
--> statement-breakpoint
CREATE TRIGGER variants_catalog_price_insert AFTER INSERT ON variants BEGIN
  UPDATE products SET available_price=CASE WHEN sale_pause IS NULL THEN (SELECT min(price_minor) FROM variants
    WHERE product_id=products.id AND visible=1 AND sale_pause IS NULL AND (stock IS NULL OR stock>0)) END,
    has_catalog_offer=EXISTS(SELECT 1 FROM variants WHERE product_id=products.id AND visible=1)
    WHERE id=NEW.product_id;
  UPDATE variants SET product_paused=(SELECT sale_pause IS NOT NULL FROM products WHERE id=NEW.product_id) WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER variants_catalog_price_delete AFTER DELETE ON variants BEGIN
  UPDATE products SET available_price=CASE WHEN sale_pause IS NULL THEN (SELECT min(price_minor) FROM variants
    WHERE product_id=products.id AND visible=1 AND sale_pause IS NULL AND (stock IS NULL OR stock>0)) END,
    has_catalog_offer=EXISTS(SELECT 1 FROM variants WHERE product_id=products.id AND visible=1)
    WHERE id=OLD.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER variants_catalog_price_update AFTER UPDATE OF product_id,visible,price_minor,stock,sale_pause ON variants BEGIN
  UPDATE products SET available_price=CASE WHEN sale_pause IS NULL THEN (SELECT min(price_minor) FROM variants
    WHERE product_id=products.id AND visible=1 AND sale_pause IS NULL AND (stock IS NULL OR stock>0)) END,
    has_catalog_offer=EXISTS(SELECT 1 FROM variants WHERE product_id=products.id AND visible=1)
    WHERE id IN (OLD.product_id,NEW.product_id);
END;
--> statement-breakpoint
CREATE TRIGGER variants_product_pause_move AFTER UPDATE OF product_id ON variants WHEN OLD.product_id IS NOT NEW.product_id BEGIN
  UPDATE variants SET product_paused=(SELECT sale_pause IS NOT NULL FROM products WHERE id=NEW.product_id) WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER products_sale_update AFTER UPDATE OF sale_pause ON products WHEN NEW.sale_pause IS NOT OLD.sale_pause BEGIN
  UPDATE products SET available_price=CASE WHEN NEW.sale_pause IS NULL THEN (SELECT min(price_minor) FROM variants
    WHERE product_id=NEW.id AND visible=1 AND sale_pause IS NULL AND (stock IS NULL OR stock>0)) END WHERE id=NEW.id;
  UPDATE variants SET product_paused=NEW.sale_pause IS NOT NULL WHERE product_id=NEW.id;
  UPDATE catalog_state SET version=version+1 WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER variants_stock_revision AFTER UPDATE OF stock ON variants WHEN NEW.stock IS NOT OLD.stock AND NEW.stock_revision=OLD.stock_revision BEGIN
  UPDATE variants SET stock_revision=OLD.stock_revision+1 WHERE id=NEW.id;
END;
--> statement-breakpoint
-- Checkout's monotonically increasing order number already invalidates the seller's list.
CREATE TRIGGER variants_seller_stock_version AFTER UPDATE OF stock ON variants
WHEN NEW.stock IS NOT OLD.stock AND NEW.purchased=OLD.purchased BEGIN
  UPDATE catalog_state SET seller_stock_version=seller_stock_version+1 WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER variants_seller_catalog_update AFTER UPDATE OF sale_pause ON variants
WHEN NEW.sale_pause IS NOT OLD.sale_pause
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
