import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const collectionSlots = sqliteTable("collection_slots", {
  startAt: integer("start_at").primaryKey(),
  reserved: integer("reserved").notNull(),
});
