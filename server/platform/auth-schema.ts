import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  telegramId: text("telegram_id").unique(),
  email: text("email").unique(),
});
export const sellerSessions = sqliteTable(
  "seller_sessions",
  {
    shopId: text("shop_id"),
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("seller_sessions_expiry_idx").on(t.expiresAt)],
);

export const sellerExchanges = sqliteTable(
  "seller_exchanges",
  {
    shopId: text("shop_id"),
    botId: text("bot_id"),
    id: text("id").primaryKey(),
    proofHash: text("proof_hash").notNull(),
    telegramId: text("telegram_id"),
    completedWith: text("completed_with"),
    returnUrl: text("return_url"),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("seller_exchanges_expiry_idx").on(table.expiresAt)],
);
