import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const checkoutQuotes = sqliteTable(
  "checkout_quotes",
  {
    id: text("id").primaryKey(),
    customer: text("customer").notNull(),
    snapshot: text("snapshot").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("checkout_quote_expiry").on(table.expiresAt)],
);

export const checkoutReceipts = sqliteTable(
  "checkout_receipts",
  {
    mediaId: text("media_id").primaryKey(),
    customer: text("customer").notNull(),
    quotedTotalMinor: integer("quoted_total_minor").notNull(),
    paymentSettings: text("payment_settings").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("checkout_receipt_expiry").on(table.expiresAt)],
);

export const orders = sqliteTable(
  "orders",
  {
    number: integer("number").primaryKey({ autoIncrement: true }),
    customer: text("customer").notNull(),
    createdAt: integer("created_at").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull().default(0),
    paymentStatus: text("payment_status").notNull(),
    proofMediaId: text("proof_media_id"),
    snapshot: text("snapshot").notNull(),
  },
  (table) => [
    index("orders_customer_number").on(table.customer, table.number),
    uniqueIndex("orders_proof_once").on(table.proofMediaId),
  ],
);

export const orderOutbox = sqliteTable("order_outbox", {
  orderNumber: integer("order_number")
    .primaryKey()
    .references(() => orders.number),
  event: text("event").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const buyerOrderRevisions = sqliteTable("buyer_order_revisions", {
  customer: text("customer").primaryKey(),
  revision: integer("revision").notNull(),
});

export const orderReceiptHistory = sqliteTable(
  "order_receipt_history",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    orderNumber: integer("order_number")
      .notNull()
      .references(() => orders.number),
    mediaId: text("media_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("order_receipts_number").on(table.orderNumber, table.sequence)],
);

export const buyerOrderEvents = sqliteTable("buyer_order_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNumber: integer("order_number")
    .notNull()
    .references(() => orders.number),
  actor: text("actor").notNull(),
  event: text("event").notNull(),
  createdAt: integer("created_at").notNull(),
});
