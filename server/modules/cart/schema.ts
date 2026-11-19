import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One bounded cart (at most 50 SKUs) per verified customer in this shop's SQLite.
// Keep a quote alongside SKU/quantity so live offer changes can be reviewed.
export const carts = sqliteTable(
  "carts",
  {
    customer: text("customer").primaryKey(),
    updatedAt: integer("updated_at").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    lines: text("lines").notNull().default("[]"),
    quote: text("quote"),
    receiving: text("receiving"),
    phone: text("phone"),
    buyerName: text("buyer_name"),
  },
  (t) => [index("carts_updated_idx").on(t.updatedAt)],
);
