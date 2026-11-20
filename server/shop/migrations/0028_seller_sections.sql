ALTER TABLE `brands` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `tile_size` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `categories_parent_order_idx` ON `categories` (`parent_id`,`position`,`id`);--> statement-breakpoint
WITH RECURSIVE navigation(root,id) AS (
  SELECT id,id FROM categories WHERE parent_id IS NULL AND visible=1
  UNION ALL SELECT n.root,c.id FROM categories c JOIN navigation n ON c.parent_id=n.id WHERE c.visible=1
), roots AS (
  SELECT c.id,(row_number() OVER (ORDER BY c.position,c.id)-1)%4 AS slot FROM categories c
  WHERE c.parent_id IS NULL AND c.visible=1 AND EXISTS(
    SELECT 1 FROM navigation n JOIN products p ON p.category_id=n.id
    WHERE n.root=c.id AND p.published=1 AND p.visible=1 AND p.has_catalog_offer=1)
)
UPDATE categories SET tile_size=(SELECT CASE WHEN slot IN (0,3) THEN '2x1' ELSE '1x1' END FROM roots WHERE roots.id=categories.id)
WHERE id IN (SELECT id FROM roots);
--> statement-breakpoint
CREATE TRIGGER categories_catalog_mosaic AFTER UPDATE OF tile_size ON categories
WHEN NEW.tile_size IS NOT OLD.tile_size BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER brands_catalog_photo AFTER UPDATE OF photo_id ON brands
WHEN NEW.photo_id IS NOT OLD.photo_id BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
DROP VIEW catalog_search_source;
--> statement-breakpoint
CREATE VIEW catalog_search_source AS
 SELECT p.id AS product_id,
        replace(replace(p.name,'ё','е'),'Ё','Е') AS name,
        replace(replace(coalesce(b.name,''),'ё','е'),'Ё','Е') AS brand,
        replace(replace(CASE WHEN NOT EXISTS(
          WITH RECURSIVE ancestors(id,parent_id,visible) AS (
            SELECT id,parent_id,visible FROM categories WHERE id=c.id
            UNION SELECT g.id,g.parent_id,g.visible FROM categories g JOIN ancestors a ON a.parent_id=g.id
          ) SELECT 1 FROM ancestors WHERE visible=0
        ) THEN coalesce(c.name || ' ' || coalesce(parent.name,''),'') ELSE '' END,'ё','е'),'Ё','Е') AS category,
        replace(replace(p.description,'ё','е'),'Ё','Е') AS description
 FROM products p LEFT JOIN categories c ON c.id=p.category_id
 LEFT JOIN categories parent ON parent.id=c.parent_id
 LEFT JOIN brands b ON b.id=p.brand_id AND b.visible=1
 WHERE p.published=1 AND p.visible=1;
--> statement-breakpoint
DROP TRIGGER catalog_search_category_update;
--> statement-breakpoint
CREATE TRIGGER catalog_search_category_update AFTER UPDATE OF name,parent_id,visible ON categories
WHEN NEW.name IS NOT OLD.name OR NEW.parent_id IS NOT OLD.parent_id OR NEW.visible IS NOT OLD.visible BEGIN
  DELETE FROM catalog_search WHERE product_id IN (
    WITH RECURSIVE subtree(id) AS (SELECT NEW.id UNION SELECT c.id FROM categories c JOIN subtree s ON c.parent_id=s.id)
    SELECT id FROM products WHERE category_id IN (SELECT id FROM subtree)
  );
  INSERT INTO catalog_search SELECT * FROM catalog_search_source WHERE product_id IN (
    WITH RECURSIVE subtree(id) AS (SELECT NEW.id UNION SELECT c.id FROM categories c JOIN subtree s ON c.parent_id=s.id)
    SELECT id FROM products WHERE category_id IN (SELECT id FROM subtree)
  );
END;
--> statement-breakpoint
DELETE FROM catalog_search;
--> statement-breakpoint
INSERT INTO catalog_search SELECT * FROM catalog_search_source;
