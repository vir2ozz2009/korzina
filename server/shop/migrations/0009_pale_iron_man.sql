ALTER TABLE `brands` ADD `photo_id` text REFERENCES media(id);
--> statement-breakpoint
DROP TRIGGER brands_catalog_update;
--> statement-breakpoint
CREATE TRIGGER brands_catalog_update AFTER UPDATE OF name,visible,position,photo_id ON brands
WHEN OLD.name IS NOT NEW.name OR OLD.visible IS NOT NEW.visible OR OLD.position IS NOT NEW.position OR OLD.photo_id IS NOT NEW.photo_id
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
