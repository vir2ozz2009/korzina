import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const shops = sqliteTable("shops", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  plan: text("plan").notNull().default("base"),
  createdAt: integer("created_at").notNull(),
});

export const domains = sqliteTable("domains", {
  host: text("host").primaryKey(),
  shopId: text("shop_id")
    .notNull()
    .references(() => shops.id),
});

export const invitations = sqliteTable("invitations", {
  tokenHash: text("token_hash").primaryKey(),
  shopId: text("shop_id")
    .notNull()
    .references(() => shops.id),
  expiresAt: integer("expires_at").notNull(),
});

export type PlatformShop = typeof shops.$inferSelect;
