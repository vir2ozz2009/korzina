import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export { carts } from "../modules/cart/schema";
export { brands, catalogState, categories, productPhotos, products, variants } from "../modules/catalog/schema";
export {
  buyerOrderEvents,
  buyerOrderRevisions,
  checkoutQuotes,
  checkoutReceipts,
  orderOutbox,
  orderReceiptHistory,
  orders,
} from "../modules/checkout/schema";
export { media, mediaUsage } from "../modules/media/schema";

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
  (table) => [primaryKey({ columns: [table.scope, table.key] }), index("idempotency_created_idx").on(table.createdAt)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    subject: text("subject").notNull(),
    kind: text("kind", { enum: ["guest", "telegram"] }).notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("sessions_expiry_idx").on(t.expiresAt), index("sessions_subject_idx").on(t.subject, t.expiresAt)],
);

export const receivingSeats = sqliteTable(
  "receiving_seats",
  {
    method: text("method").notNull(),
    date: text("date").notNull(),
    slot: text("slot").notNull(),
    booked: integer("booked").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.method, table.date, table.slot] }),
    index("receiving_seats_expiry").on(table.expiresAt),
  ],
);

export const customerTelegramExchanges = sqliteTable(
  "customer_telegram_exchanges",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    telegramSubject: text("telegram_subject"),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("customer_telegram_exchange_expiry").on(table.expiresAt)],
);
