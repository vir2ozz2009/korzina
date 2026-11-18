ALTER TABLE catalog_state ADD selection_version integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `available_price` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `has_catalog_offer` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE products
 SET available_price=(SELECT min(price_minor) FROM variants WHERE product_id=products.id AND visible=1 AND (stock IS NULL OR stock>0)),
     has_catalog_offer=EXISTS(SELECT 1 FROM variants WHERE product_id=products.id AND visible=1)
 ;
--> statement-breakpoint
CREATE TRIGGER variants_catalog_price_insert AFTER INSERT ON variants
 BEGIN
   UPDATE products
 SET available_price=(SELECT min(price_minor) FROM variants WHERE product_id=products.id AND visible=1 AND (stock IS NULL OR stock>0)),
     has_catalog_offer=EXISTS(SELECT 1 FROM variants WHERE product_id=products.id AND visible=1)
 WHERE id IN (NEW.product_id);
 END;--> statement-breakpoint
CREATE TRIGGER variants_catalog_price_delete AFTER DELETE ON variants
 BEGIN
   UPDATE products
 SET available_price=(SELECT min(price_minor) FROM variants WHERE product_id=products.id AND visible=1 AND (stock IS NULL OR stock>0)),
     has_catalog_offer=EXISTS(SELECT 1 FROM variants WHERE product_id=products.id AND visible=1)
 WHERE id IN (OLD.product_id);
 END;--> statement-breakpoint
CREATE TRIGGER variants_catalog_price_update AFTER UPDATE OF product_id,visible,price_minor,stock ON variants
 BEGIN
   UPDATE products
 SET available_price=(SELECT min(price_minor) FROM variants WHERE product_id=products.id AND visible=1 AND (stock IS NULL OR stock>0)),
     has_catalog_offer=EXISTS(SELECT 1 FROM variants WHERE product_id=products.id AND visible=1)
 WHERE id IN (OLD.product_id,NEW.product_id);
 END;--> statement-breakpoint
CREATE INDEX products_catalog_price_idx ON products (published,visible,has_catalog_offer,coalesce(available_price, -1),id);--> statement-breakpoint
CREATE INDEX products_catalog_name_idx ON products (published,visible,has_catalog_offer,name COLLATE NOCASE,id);--> statement-breakpoint
CREATE INDEX products_catalog_offer_idx ON products (published,visible,has_catalog_offer,id);--> statement-breakpoint
CREATE INDEX products_catalog_range_idx ON products (published,visible,has_catalog_offer,available_price,id);--> statement-breakpoint
CREATE TRIGGER products_catalog_selection_update AFTER UPDATE OF available_price,has_catalog_offer ON products
WHEN NEW.available_price IS NOT OLD.available_price OR NEW.has_catalog_offer != OLD.has_catalog_offer
BEGIN UPDATE catalog_state SET selection_version=selection_version+1 WHERE id=1; END;
