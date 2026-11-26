import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { PromoTerms } from "../../../src/shared/contracts/promo";
import { orders } from "../checkout/schema";

export const promoOffers = sqliteTable(
  "promo_offers",
  {
    id: text("id").primaryKey().notNull(),
    revision: integer("revision").notNull(),
    state: text("state", { enum: ["draft", "published", "disabled"] }).notNull(),
    kind: text("kind", { enum: ["automatic", "code"] }).notNull(),
    code: text("code"),
    startsAt: integer("starts_at"),
    endsAt: integer("ends_at"),
    terms: text("terms", { mode: "json" }).$type<PromoTerms>().notNull(),
    actor: text("actor").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("promo_active_idx").on(t.state, t.kind, t.code, t.endsAt, t.startsAt),
    check("promo_state_valid", sql`${t.state} IN ('draft','published','disabled')`),
    check("promo_kind_valid", sql`${t.kind} IN ('automatic','code')`),
  ],
);

export const promoUses = sqliteTable(
  "promo_uses",
  {
    orderNumber: integer("order_number")
      .notNull()
      .references(() => orders.number, { onDelete: "cascade" }),
    offerId: text("offer_id")
      .notNull()
      .references(() => promoOffers.id),
    customer: text("customer"),
    purchaseNumber: integer("purchase_number"),
    amountMinor: integer("amount_minor").notNull(),
    releasedAt: integer("released_at"),
  },
  (t) => [
    primaryKey({ columns: [t.orderNumber, t.offerId] }),
    index("promo_offer_uses_idx").on(t.offerId, t.customer).where(sql`${t.releasedAt} IS NULL`),
    index("promo_reporting_idx").on(t.offerId, t.orderNumber),
    uniqueIndex("promo_purchase_right_idx")
      .on(t.customer, t.purchaseNumber)
      .where(sql`${t.releasedAt} IS NULL AND ${t.purchaseNumber} IS NOT NULL`),
  ],
);
