ALTER TABLE `products` ADD `catalog_sold_out` integer GENERATED ALWAYS AS (available_price IS NULL) VIRTUAL;--> statement-breakpoint
CREATE INDEX `products_catalog_availability_idx` ON `products` (`published`,`visible`,`has_catalog_offer`,`catalog_sold_out`,`id`);--> statement-breakpoint
CREATE INDEX `products_catalog_available_name_idx` ON `products` (`published`,`visible`,`has_catalog_offer`,`catalog_sold_out`,"name" COLLATE NOCASE,`id`);
--> statement-breakpoint
DROP TRIGGER products_catalog_selection_update;
--> statement-breakpoint
CREATE TRIGGER products_catalog_selection_update AFTER UPDATE OF available_price,has_catalog_offer ON products
WHEN NEW.available_price IS NOT OLD.available_price OR NEW.has_catalog_offer != OLD.has_catalog_offer
BEGIN
  UPDATE catalog_state
    SET selection_version=selection_version+1,
        version=version+(NEW.published=1 AND NEW.visible=1 AND NEW.catalog_sold_out != OLD.catalog_sold_out)
    WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER catalog_visibility_version AFTER UPDATE OF hide_out_of_stock ON catalog_state
WHEN NEW.hide_out_of_stock != OLD.hide_out_of_stock
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
UPDATE catalog_state SET version=version+1,selection_version=selection_version+1 WHERE id=1;
