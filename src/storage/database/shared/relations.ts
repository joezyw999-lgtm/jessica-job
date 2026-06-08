import { relations } from "drizzle-orm/relations";
import { wechatImportTasks, wechatImportImages, recruitmentRecords } from "./schema";

export const wechatImportImagesRelations = relations(wechatImportImages, ({one}) => ({
	wechatImportTask: one(wechatImportTasks, {
		fields: [wechatImportImages.taskId],
		references: [wechatImportTasks.id]
	}),
}));

export const wechatImportTasksRelations = relations(wechatImportTasks, ({many}) => ({
	wechatImportImages: many(wechatImportImages),
	recruitmentRecords: many(recruitmentRecords),
}));

export const recruitmentRecordsRelations = relations(recruitmentRecords, ({one}) => ({
	wechatImportTask: one(wechatImportTasks, {
		fields: [recruitmentRecords.taskId],
		references: [wechatImportTasks.id]
	}),
}));