import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const platformSettings = sqliteTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

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

export const featureOverrides = sqliteTable(
  "feature_overrides",
  {
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    key: text("key").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.shopId, table.key] })],
);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  telegramId: text("telegram_id").unique(),
  email: text("email").unique(),
});
export const memberships = sqliteTable(
  "memberships",
  {
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    role: text("role").notNull(),
    permissions: text("permissions").notNull().default("[]"),
    revokedAt: integer("revoked_at"),
  },
  (table) => [primaryKey({ columns: [table.shopId, table.accountId] })],
);
export const sellerSessions = sqliteTable(
  "seller_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("seller_sessions_expiry_idx").on(t.expiresAt)],
);
export const emailChallenges = sqliteTable("email_challenges", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  usedAt: integer("used_at"),
  attemptId: text("attempt_id"),
});
