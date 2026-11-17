CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `brands_navigation_idx` ON `brands` (`visible`,`id`);--> statement-breakpoint
CREATE TABLE `catalog_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`hide_out_of_stock` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`visible` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`photo_id` text,
	FOREIGN KEY (`photo_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `categories_navigation_idx` ON `categories` (`visible`,`id`);--> statement-breakpoint
CREATE TABLE `product_photos` (
	`product_id` text NOT NULL,
	`position` integer NOT NULL,
	`media_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `position`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category_id` text NOT NULL,
	`brand_id` text,
	`published` integer DEFAULT false NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `products_storefront_idx` ON `products` (`published`,`visible`,`id`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`published`,`visible`,`category_id`,`id`);--> statement-breakpoint
CREATE INDEX `products_brand_idx` ON `products` (`published`,`visible`,`brand_id`,`id`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`price_minor` integer NOT NULL,
	`old_price_minor` integer,
	`stock` integer,
	`visible` integer DEFAULT true NOT NULL,
	`product_available` integer DEFAULT false NOT NULL,
	`photo_id` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "variants_price_check" CHECK("variants"."price_minor" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "variants_old_price_check" CHECK("variants"."old_price_minor" IS NULL OR "variants"."old_price_minor" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "variants_stock_check" CHECK("variants"."stock" IS NULL OR "variants"."stock" BETWEEN 0 AND 9007199254740991)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `variants` (`product_id`,`visible`,`position`);--> statement-breakpoint
INSERT INTO catalog_state(id) VALUES (1);
--> statement-breakpoint
CREATE TRIGGER categories_catalog_insert AFTER INSERT ON categories
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER categories_catalog_delete AFTER DELETE ON categories
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER categories_catalog_update AFTER UPDATE OF name,parent_id,visible,position,photo_id ON categories
WHEN OLD.name IS NOT NEW.name OR OLD.parent_id IS NOT NEW.parent_id OR OLD.visible IS NOT NEW.visible OR OLD.position IS NOT NEW.position OR OLD.photo_id IS NOT NEW.photo_id
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER brands_catalog_insert AFTER INSERT ON brands
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER brands_catalog_delete AFTER DELETE ON brands
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER brands_catalog_update AFTER UPDATE OF name,visible,position ON brands
WHEN OLD.name IS NOT NEW.name OR OLD.visible IS NOT NEW.visible OR OLD.position IS NOT NEW.position
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER products_catalog_insert AFTER INSERT ON products
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER products_catalog_delete AFTER DELETE ON products
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER products_catalog_update AFTER UPDATE OF name,description,category_id,brand_id,published,visible ON products
WHEN OLD.name IS NOT NEW.name OR OLD.description IS NOT NEW.description OR OLD.category_id IS NOT NEW.category_id OR OLD.brand_id IS NOT NEW.brand_id OR OLD.published IS NOT NEW.published OR OLD.visible IS NOT NEW.visible
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER product_photos_catalog_insert AFTER INSERT ON product_photos
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER product_photos_catalog_delete AFTER DELETE ON product_photos
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER product_photos_catalog_update AFTER UPDATE OF product_id,position,media_id ON product_photos
WHEN OLD.product_id IS NOT NEW.product_id OR OLD.position IS NOT NEW.position OR OLD.media_id IS NOT NEW.media_id
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER variants_catalog_insert AFTER INSERT ON variants
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER variants_catalog_delete AFTER DELETE ON variants
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER variants_catalog_update AFTER UPDATE OF product_id,name,visible,position,photo_id ON variants
WHEN OLD.product_id IS NOT NEW.product_id OR OLD.name IS NOT NEW.name OR OLD.visible IS NOT NEW.visible OR OLD.position IS NOT NEW.position OR OLD.photo_id IS NOT NEW.photo_id
BEGIN UPDATE catalog_state SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER variants_availability_insert AFTER INSERT ON variants
BEGIN UPDATE variants SET product_available=(SELECT published AND visible FROM products WHERE id=NEW.product_id) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER variants_availability_move AFTER UPDATE OF product_id,product_available ON variants
WHEN NEW.product_available IS NOT (SELECT published AND visible FROM products WHERE id=NEW.product_id)
BEGIN UPDATE variants SET product_available=(SELECT published AND visible FROM products WHERE id=NEW.product_id) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER products_availability_update AFTER UPDATE OF published,visible ON products
WHEN OLD.published IS NOT NEW.published OR OLD.visible IS NOT NEW.visible
BEGIN UPDATE variants SET product_available=NEW.published AND NEW.visible WHERE product_id=NEW.id; END;
