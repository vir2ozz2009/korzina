import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const favorites = sqliteTable(
  "buyer_favorites",
  {
    customer: text("customer").notNull(),
    productId: text("product_id").notNull(),
    addedAt: integer("added_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.customer, table.productId] }),
    index("buyer_favorites_recent").on(table.customer, table.addedAt, table.productId),
  ],
);
