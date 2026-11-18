CREATE VIRTUAL TABLE catalog_search USING fts5(product_id UNINDEXED, name, brand, category, description,
  tokenize='unicode61 remove_diacritics 2', prefix='2 3');--> statement-breakpoint
CREATE VIEW catalog_search_source AS
 SELECT p.id AS product_id,
        replace(replace(p.name,'ё','е'),'Ё','Е') AS name,
        replace(replace(coalesce(b.name,''),'ё','е'),'Ё','Е') AS brand,
        replace(replace(c.name || ' ' || coalesce(parent.name,''),'ё','е'),'Ё','Е') AS category,
        replace(replace(p.description,'ё','е'),'Ё','Е') AS description
 FROM products p JOIN categories c ON c.id=p.category_id
 LEFT JOIN categories parent ON parent.id=c.parent_id
 LEFT JOIN brands b ON b.id=p.brand_id AND b.visible=1
 WHERE p.published=1 AND p.visible=1;--> statement-breakpoint
INSERT INTO catalog_search SELECT * FROM catalog_search_source;--> statement-breakpoint
CREATE TRIGGER catalog_search_product_insert AFTER INSERT ON products BEGIN
  INSERT INTO catalog_search SELECT * FROM catalog_search_source WHERE product_id=NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER catalog_search_product_update AFTER UPDATE OF name,brand_id,category_id,description,published,visible ON products BEGIN
  DELETE FROM catalog_search WHERE product_id=OLD.id;
  INSERT INTO catalog_search SELECT * FROM catalog_search_source WHERE product_id=NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER catalog_search_product_delete AFTER DELETE ON products BEGIN
  DELETE FROM catalog_search WHERE product_id=OLD.id;
END;--> statement-breakpoint
CREATE TRIGGER catalog_search_brand_update AFTER UPDATE OF name,visible ON brands BEGIN
  DELETE FROM catalog_search WHERE product_id IN (SELECT id FROM products WHERE brand_id=NEW.id);
  INSERT INTO catalog_search SELECT * FROM catalog_search_source WHERE product_id IN (SELECT id FROM products WHERE brand_id=NEW.id);
END;--> statement-breakpoint
CREATE TRIGGER catalog_search_category_update AFTER UPDATE OF name,parent_id,visible ON categories BEGIN
  DELETE FROM catalog_search WHERE product_id IN (
    SELECT id FROM products WHERE category_id=NEW.id OR category_id IN (SELECT id FROM categories WHERE parent_id=NEW.id)
  );
  INSERT INTO catalog_search SELECT * FROM catalog_search_source WHERE product_id IN (
    SELECT id FROM products WHERE category_id=NEW.id OR category_id IN (SELECT id FROM categories WHERE parent_id=NEW.id)
  );
END;
