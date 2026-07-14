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

// 兼容读取：优先读 camelCase，fallback 到 snake_case
function getStr(row: Record<string, unknown>, camel: string, snake: string): string {
  if (camel in row && row[camel] !== undefined && row[camel] !== null) return row[camel] as string;
  if (snake in row && row[snake] !== undefined && row[snake] !== null) return row[snake] as string;
  return "";
}

// DB 行 → 前端 Record（兼容 snake_case 和 camelCase 两种输入格式）
export function dbToRecord(row: Record<string, unknown>): InterviewRecord {
  let imageUrls: string[] = [];
  const rawImageUrls =
    ("imageUrls" in row && row.imageUrls) || ("image_urls" in row && row.image_urls);
  try {
    if (rawImageUrls) {
      imageUrls = Array.isArray(rawImageUrls) ? rawImageUrls : JSON.parse(rawImageUrls as string);
    }
  } catch { /* ignore */ }
  const imageUrl = getStr(row, "imageUrl", "image_url");
  if (imageUrls.length === 0 && imageUrl) {
    imageUrls = [imageUrl];
  }
  const createdAt =
    ("createdAt" in row && row.createdAt) || ("created_at" in row && row.created_at) || undefined;
  const updatedAt =
    ("updatedAt" in row && row.updatedAt) || ("updated_at" in row && row.updated_at) || undefined;
  const errorMsg =
    ("errorMsg" in row && row.errorMsg) || ("error_msg" in row && row.error_msg) || undefined;
  return {
    id: row.id as string,
    imageUrl: imageUrl,
    imageUrls,
    imageFileKey: getStr(row, "imageFileKey", "image_file_key"),
    fileName: getStr(row, "fileName", "file_name") || getStr(row, "imageFileKey", "image_file_key") || "图片",
    company: getStr(row, "company", "company"),
    position: getStr(row, "position", "position"),
    industry: getStr(row, "industry", "industry"),
    category: getStr(row, "category", "category") || "国内",
    experienceType: getStr(row, "experienceType", "experience_type") || "面经",
    country: getStr(row, "country", "country") || "大陆",
    content: getStr(row, "content", "content"),
    originalContent: getStr(row, "originalContent", "original_content"),
    status: (getStr(row, "status", "status") as RecordStatus) || "done",
    errorMsg: errorMsg as string | undefined,
    deviceId: getStr(row, "deviceId", "device_id") || undefined,
    createdAt: createdAt as string | undefined,
    updatedAt: updatedAt as string | undefined,
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
