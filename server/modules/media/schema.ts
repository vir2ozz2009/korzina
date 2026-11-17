import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { MediaPurpose } from "../../../src/shared/contracts/media";

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    purpose: text("purpose").$type<MediaPurpose>().notNull(),
    status: text("status", { enum: ["temp", "attached", "deleted"] }).notNull(),
    ready: integer("ready", { mode: "boolean" }).notNull().default(false),
    bytes: integer("bytes").notNull(),
    mime: text("mime").notNull(),
    display: text("display", { enum: ["cutout", "photo"] })
      .notNull()
      .default("photo"),
    cutout: integer("cutout", { mode: "boolean" }).notNull().default(false),
    requestKey: text("request_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at"),
  },
  (table) => [
    index("media_expiry_idx").on(table.expiresAt),
    uniqueIndex("media_request_idx").on(table.owner, table.requestKey),
  ],
);

export type MediaRecord = typeof media.$inferSelect;

export const mediaUsage = sqliteTable("media_usage", {
  id: integer("id").primaryKey(),
  bytes: integer("bytes").notNull().default(0),
});
