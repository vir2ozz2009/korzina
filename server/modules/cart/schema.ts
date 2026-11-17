import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One bounded cart (at most 50 SKUs) per verified customer in this shop's SQLite.
// Persist only SKU/quantity; names, prices and availability are always joined live.
export const carts = sqliteTable(
  "carts",
  {
    customer: text("customer").primaryKey(),
    updatedAt: integer("updated_at").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    lines: text("lines").notNull().default("[]"),
  },
  (t) => [index("carts_updated_idx").on(t.updatedAt)],
);
