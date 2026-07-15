import { pgTable, serial, timestamp, index, varchar, text, foreignKey, integer, doublePrecision, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const mianjingRecords = pgTable("mianjing_records", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	imageUrl: text("image_url").notNull(),
	imageFileKey: varchar("image_file_key", { length: 500 }),
	company: varchar({ length: 200 }),
	position: varchar({ length: 200 }),
	industry: varchar({ length: 100 }),
	originalContent: text("original_content"),
	content: text(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	deviceId: varchar("device_id", { length: 64 }),
	category: varchar({ length: 32 }).default('国内'),
	experienceType: varchar("experience_type", { length: 32 }).default('面经'),
	country: varchar({ length: 32 }).default('大陆'),
	imageUrls: text("image_urls"),
	fileName: text("file_name"),
	errorMsg: text("error_msg"),
}, (table) => [
	index("mianjing_records_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("mianjing_records_device_id_idx").using("btree", table.deviceId.asc().nullsLast().op("text_ops")),
	index("mianjing_records_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const wechatImportTasks = pgTable("wechat_import_tasks", {
	id: text().primaryKey().notNull(),
	deviceId: text("device_id").notNull(),
	sourceUrl: text("source_url"),
	title: text(),
	accountName: text("account_name"),
	publishTime: text("publish_time"),
	contentText: text("content_text"),
	contentHtml: text("content_html"),
	importMethod: text("import_method").default('bookmarklet'),
	status: text().default('pending'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const wechatImportImages = pgTable("wechat_import_images", {
	id: text().primaryKey().notNull(),
	taskId: text("task_id").notNull(),
	imageUrl: text("image_url"),
	imageHash: text("image_hash"),
	width: integer(),
	height: integer(),
	ocrText: text("ocr_text"),
	ocrConfidence: doublePrecision("ocr_confidence"),
	qrContent: text("qr_content"),
	status: text().default('pending'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
				columns: [table.taskId],
				foreignColumns: [wechatImportTasks.id],
				name: "wechat_import_images_task_id_fkey"
			}),
]);

export const recruitmentRecords = pgTable("recruitment_records", {
	id: text().primaryKey().notNull(),
	deviceId: text("device_id").notNull(),
	taskId: text("task_id"),
	companyName: text("company_name"),
	companyType: text("company_type"),
	recruitmentType: text("recruitment_type"),
	industry: text(),
	theme: text(),
	deadline: text(),
	targetCandidates: text("target_candidates"),
	referral: text(),
	locations: text(),
	positions: text(),
	requirements: text(),
	applicationUrl: text("application_url"),
	sourceUrl: text("source_url"),
	sourceType: text("source_type").default('wechat_article'),
	confidence: doublePrecision().default(0),
	fieldSources: text("field_sources"),
	warnings: text(),
	rawLlmOutput: text("raw_llm_output"),
	confirmed: boolean().default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
				columns: [table.taskId],
				foreignColumns: [wechatImportTasks.id],
				name: "recruitment_records_task_id_fkey"
			}),
]);

export const campusSearchTasks = pgTable("campus_search_tasks", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	keyword: varchar({ length: 500 }).notNull(),
	resultsCount: integer("results_count").default(0),
	newRecordsCount: integer("new_records_count").default(0),
	searchedAt: timestamp("searched_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("campus_search_tasks_keyword_idx").on(table.keyword),
	index("campus_search_tasks_searched_at_idx").on(table.searchedAt),
]);

export const campusRecords = pgTable("campus_records", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	companyName: varchar("company_name", { length: 200 }),
	recruitmentType: varchar("recruitment_type", { length: 32 }).notNull(),
	sourceUrl: text("source_url").notNull(),
	sourceName: varchar("source_name", { length: 200 }),
	sourceType: varchar("source_type", { length: 20 }).default('unknown'),
	status: varchar({ length: 20 }).default('active').notNull(),
	discoveredAt: timestamp("discovered_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
	index("campus_records_company_type_idx").on(table.companyName, table.recruitmentType),
	index("campus_records_source_url_idx").on(table.sourceUrl),
	index("campus_records_status_idx").on(table.status),
	index("campus_records_created_at_idx").on(table.createdAt),
]);
