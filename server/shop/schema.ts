import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const idempotency = sqliteTable(
  "idempotency",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    response: text("response").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.key] })],
);
