// 面经记录类型定义（前端使用）

export type RecordStatus = "pending" | "extracting" | "done" | "error";

export interface InterviewRecord {
  id: string;
  imageUrl: string;
  imageUrls: string[];
  imageFileKey: string;
  fileName: string;
  company: string;
  position: string;
  industry: string;
  category: string;
  experienceType: string;
  country: string;
  content: string;
  originalContent: string;
  status: RecordStatus;
  errorMsg?: string;
  deviceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// 行业列表（与 API 端保持一致）
export const INDUSTRY_LIST = [
  "互联网", "科技", "电商", "金融", "券商", "基金", "银行", "快消", "零售", "奢侈品",
  "咨询", "综合", "通信", "物流", "交通", "医药", "制造", "能源", "保险", "房地产",
  "广告", "公关", "生物", "机械", "环境", "材料", "化工", "石油", "建筑", "游戏",
  "高校", "商业服务", "航天", "设计", "环保", "耐消", "餐饮", "供应链", "维修", "物业",
  "体育", "酒店", "人力", "会计师事务所", "电气", "轻工业", "钢铁", "贸易", "律所",
  "汽车", "文旅", "食品", "农业", "新能源", "教育", "传媒",
];

// DB 行 → 前端 Record
export function dbToRecord(row: Record<string, unknown>): InterviewRecord {
  let imageUrls: string[] = [];
  try {
    if (row.image_urls) imageUrls = JSON.parse(row.image_urls as string);
  } catch { /* ignore */ }
  if (imageUrls.length === 0 && row.image_url) {
    imageUrls = [row.image_url as string];
  }
  return {
    id: row.id as string,
    imageUrl: (row.image_url as string) || "",
    imageUrls,
    imageFileKey: (row.image_file_key as string) || "",
    fileName: (row.file_name as string) || (row.image_file_key as string) || "图片",
    company: (row.company as string) || "",
    position: (row.position as string) || "",
    industry: (row.industry as string) || "",
    category: (row.category as string) || "国内",
    experienceType: (row.experience_type as string) || "面经",
    country: (row.country as string) || "大陆",
    content: (row.content as string) || "",
    originalContent: (row.original_content as string) || "",
    status: (row.status as RecordStatus) || "done",
    errorMsg: (row.error_msg as string) || undefined,
    deviceId: (row.device_id as string) || undefined,
    createdAt: (row.created_at as string) || undefined,
    updatedAt: (row.updated_at as string) || undefined,
  };
}

// 前端 Record → DB 字段
export function recordToDb(record: Partial<InterviewRecord> & { device_id?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (record.device_id !== undefined) out.device_id = record.device_id;
  if (record.imageUrl !== undefined) out.image_url = record.imageUrl;
  if (record.imageUrls !== undefined) out.image_urls = JSON.stringify(record.imageUrls);
  if (record.imageFileKey !== undefined) out.image_file_key = record.imageFileKey;
  if (record.fileName !== undefined) out.file_name = record.fileName;
  if (record.company !== undefined) out.company = record.company;
  if (record.position !== undefined) out.position = record.position;
  if (record.industry !== undefined) out.industry = record.industry;
  if (record.category !== undefined) out.category = record.category;
  if (record.experienceType !== undefined) out.experience_type = record.experienceType;
  if (record.country !== undefined) out.country = record.country;
  if (record.originalContent !== undefined) out.original_content = record.originalContent;
  if (record.content !== undefined) out.content = record.content;
  if (record.status !== undefined) out.status = record.status;
  return out;
}

// 分页查询参数
export interface RecordQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  company?: string;
  position?: string;
  industry?: string;
  category?: string;
  experienceType?: string;
  country?: string;
  status?: string;
  device_id?: string;
}

// 分页返回结构
export interface PaginatedResult {
  success: boolean;
  data: InterviewRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

// 生成唯一临时 ID
export function genTempId(prefix = "rec"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
