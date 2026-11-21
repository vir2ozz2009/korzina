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
  version: integer("version").notNull().default(0),
  country: text("country"),
  currency: text("currency"),
  timeZone: text("time_zone"),
  theme: text("theme"),
  botUsername: text("bot_username"),
  ownerName: text("owner_name"),
  statusNotice: text("status_notice"),
  createdAt: integer("created_at").notNull(),
});

export const domains = sqliteTable("domains", {
  host: text("host").primaryKey(),
  shopId: text("shop_id")
    .notNull()
    .references(() => shops.id),
});

export const invitations = sqliteTable(
  "invitations",
  {
    tokenHash: text("token_hash").primaryKey(),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    expiresAt: integer("expires_at").notNull(),
    linkId: text("link_id").unique(),
    platformAllowed: integer("platform_allowed", { mode: "boolean" }).notNull().default(false),
    usedBy: text("used_by"),
    redeemedId: text("redeemed_id"),
    revokedAt: integer("revoked_at"),
    replacementReason: text("replacement_reason"),
  },
  (table) => [index("invitations_expiry_idx").on(table.expiresAt), index("invitations_shop_idx").on(table.shopId)],
);

export type PlatformShop = Pick<typeof shops.$inferSelect, "id" | "slug" | "name" | "status" | "plan" | "createdAt">;

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
    teamRole: text("team_role"),
    displayName: text("display_name"),
    version: integer("version").notNull().default(0),
    revokedAt: integer("revoked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.shopId, table.accountId] }),
    index("memberships_account_idx").on(table.accountId),
  ],
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

export const staffInvitations = sqliteTable(
  "staff_invitations",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    role: text("role").notNull(),
    permissions: text("permissions").notNull(),
    bot: text("bot").notNull(),
    botUsername: text("bot_username").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedBy: text("used_by"),
    redemptionId: text("redemption_id"),
    revokedAt: integer("revoked_at"),
  },
  (table) => [
    index("staff_invitations_shop_expiry_idx").on(table.shopId, table.expiresAt),
    index("staff_invitations_expiry_idx").on(table.expiresAt),
  ],
);

export const staffBotChats = sqliteTable(
  "staff_bot_chats",
  {
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    bot: text("bot").notNull(),
  },
  (table) => [primaryKey({ columns: [table.shopId, table.accountId, table.bot] })],
);

export const staffRoleNotifications = sqliteTable(
  "staff_role_notifications",
  {
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    role: text("role").notNull(),
    topic: text("topic").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.shopId, table.role, table.topic] })],
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

export const demoSeedQueue = sqliteTable("demo_seed_queue", {
  shopId: text("shop_id")
    .primaryKey()
    .references(() => shops.id),
  requestedAt: text("requested_at").notNull(),
});

export const sellerExchanges = sqliteTable(
  "seller_exchanges",
  {
    id: text("id").primaryKey(),
    proofHash: text("proof_hash").notNull(),
    telegramId: text("telegram_id"),
    completedWith: text("completed_with"),
    returnUrl: text("return_url"),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("seller_exchanges_expiry_idx").on(table.expiresAt)],
);

export const platformAdmins = sqliteTable("platform_admins", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
});

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => platformAdmins.accountId, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("admin_sessions_expiry_idx").on(table.expiresAt)],
);

export const platformCommands = sqliteTable(
  "platform_commands",
  {
    accountId: text("account_id").notNull(),
    key: text("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: text("result").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.key] }),
    index("platform_commands_created_idx").on(table.createdAt),
  ],
);

export const platformAudit = sqliteTable(
  "platform_audit",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    changed: text("changed").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("platform_audit_created_idx").on(table.createdAt)],
);

export const platformOrderEvents = sqliteTable(
  "platform_order_events",
  {
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    orderNumber: integer("order_number").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.shopId, table.orderNumber] }),
    index("platform_order_events_date_idx").on(table.createdAt, table.shopId),
  ],
);

export const shopBots = sqliteTable("shop_bots", {
  shopId: text("shop_id")
    .primaryKey()
    .references(() => shops.id),
  telegramId: text("telegram_id").unique(),
  username: text("username"),
  token: text("token"),
});
