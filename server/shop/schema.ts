import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export { carts } from "../modules/cart/schema";
export { brands, catalogState, categories, productPhotos, products, variants } from "../modules/catalog/schema";
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
    deliveryAddresses: text("delivery_addresses").notNull().default("[]"),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("sessions_expiry_idx").on(t.expiresAt), index("sessions_subject_idx").on(t.subject, t.expiresAt)],
);
