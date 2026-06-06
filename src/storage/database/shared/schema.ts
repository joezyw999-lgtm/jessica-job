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
    device_id: varchar("device_id", { length: 64 }),
    image_url: text("image_url").notNull(),
    image_file_key: varchar("image_file_key", { length: 500 }),
    image_urls: text("image_urls"),
    company: varchar("company", { length: 200 }),
    position: varchar("position", { length: 200 }),
    industry: varchar("industry", { length: 100 }),
    category: varchar("category", { length: 32 }).default("国内"),
    experience_type: varchar("experience_type", { length: 32 }).default("面经"),
    country: varchar("country", { length: 32 }).default("大陆"),
    original_content: text("original_content"),
    content: text("content"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("mianjing_records_status_idx").on(table.status),
    index("mianjing_records_created_at_idx").on(table.created_at),
    index("mianjing_records_device_id_idx").on(table.device_id),
  ]
);
