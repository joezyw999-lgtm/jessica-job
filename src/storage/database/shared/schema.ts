import { pgTable, serial, timestamp, varchar, text, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const mianjingRecords = pgTable(
  "mianjing_records",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    image_url: text("image_url").notNull(),
    image_file_key: varchar("image_file_key", { length: 500 }),
    company: varchar("company", { length: 200 }),
    position: varchar("position", { length: 200 }),
    industry: varchar("industry", { length: 100 }),
    original_content: text("original_content"),
    content: text("content"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("mianjing_records_status_idx").on(table.status),
    index("mianjing_records_created_at_idx").on(table.created_at),
  ]
);
