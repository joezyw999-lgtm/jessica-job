import { NextRequest, NextResponse } from "next/server";
import { callVisionLLM, hasLLMConfig } from "@/lib/llm-client";
import { buildPositionWithRounds, formatContent } from "@/lib/utils";

// 安全的字符串转换
function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join("\n");
  return JSON.stringify(value);
}

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-device-id',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// 健壮的 JSON 解析（处理 markdown 代码块、纯文本等情况）
function robustJsonParse(text: string): Record<string, unknown> {
  // 1. 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 继续尝试其他方式
  }

  // 2. 提取 markdown 代码块中的 JSON
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // 继续尝试
    }
  }

  // 3. 查找第一个 { 到最后一个 } 之间的内容
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // 继续尝试
    }
  }

  // 4. 返回默认空对象
  return {};
}

// 验证 API 配置
function validateConfig(): { valid: boolean; error?: string } {
  if (hasLLMConfig()) {
    return { valid: true };
  }

  return { valid: false, error: '请配置 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL 环境变量' };
}

export async function POST(request: NextRequest) {
  // 验证配置
  const configCheck = validateConfig();
  if (!configCheck.valid) {
    return NextResponse.json(
      { error: configCheck.error || '请配置 LLM_API_KEY 环境变量' },
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const body = await request.json();
    const imageUrl = body.imageUrl as string | undefined;
    const imageUrls = body.imageUrls as string[] | undefined;

    if (!imageUrl && (!imageUrls || imageUrls.length === 0)) {
      return NextResponse.json({ error: "缺少 imageUrl 参数" }, { status: 400, headers: corsHeaders });
    }

    // 合并所有图片 URL
    const allImageUrls = imageUrls && imageUrls.length > 0 ? imageUrls : (imageUrl ? [imageUrl] : []);

    const imageCount = allImageUrls.length;
    const isMultiImage = imageCount > 1;

    // Prompt：单图/多图通用，多图时强调按顺序合并
    const prompt = `你是一个面经整理助手，请从面经图片中提取结构化信息。特别注意：

${isMultiImage ? `⚠️ 共有 ${imageCount} 张图片，属于同一条面经的连续截图（按从上到下 / 从左到右的顺序排列）。请按图片顺序完整读取所有内容，合并为一条面经记录。不要拆分成多条记录，不要遗漏任何面试问题，不要重复记录同一问题。如果多张图片明显不是同一条面经（比如公司或岗位不一致），请在 company 字段返回 "NOT_SAME_INTERVIEW" 表示需要人工确认。\n` : ""}

1. **岗位**字段必须包含完整的面试轮次信息：
   - 单轮：如"产品经理一面"、"数据分析二面"、"HR面"
   - 多轮：必须把所有出现的轮次合并到岗位字段中，不要只写其中一个轮次
     - 一面 + 二面 → "产品经理一二面"
     - 一面 + 二面 + 三面 → "产品经理一二三面"
     - 一面 + 二面 + HR面 → "产品经理一二面+HR面"
     - 一面 + 二面 + 三面 + 终面 → "产品经理一二三面+终面"
   - 如果识别不到岗位但有轮次："未知岗位一二三面"
   - 如果岗位和轮次都识别不到："未知岗位"
2. **行业**字段必须从以下列表中选择，如果没有合适的就留空：
   互联网、科技、电商、金融、券商、基金、银行、快消、零售、奢侈品、咨询、综合、通信、物流、交通、医药、制造、能源、保险、房地产、广告、公关、生物、机械、环境、材料、化工、石油、建筑、游戏、高校、商业服务、航天、设计、环保、耐消、餐饮、供应链、维修、物业、体育、酒店、人力、会计师事务所、电气、轻工业、钢铁、贸易、律所、汽车、文旅、食品、农业、新能源、教育、传媒
3. **内容**字段只提取面试问题，不要包含答案、寒暄、水话、广告等内容
4. **重要**：面试问题必须完整保留，不允许删减、精简、合并或省略任何问题，保持原汁原味${isMultiImage ? "，注意跨图片的问题不要拆断" : ""}
5. **多轮面试**：如果面经包含多轮（一面/二面/三面/HR面/终面等），必须按轮次分别列出，每轮有独立编号，标注清楚"【一面】"、"【二面】"等轮次名称，不得混合编号
6. **追问**：追问必须紧跟在对应问题之下，标明"追问"
7. **反问**：必须保留"反问"二字，每轮面试的反问归属于对应轮次，在该轮末尾列出

请以 JSON 格式输出（不要包裹在 markdown 代码块中）：
{
  "company": "公司名称",
  "position": "岗位名称（含轮次，如'产品经理一面'）",
  "industry": "行业（必须从上述列表选择，没有合适的留空字符串）",
  "content": "清洗后的面经内容（只含完整面试问题，多轮面试需分轮次标注）",
  "originalContent": "原始面经内容（完整保留）"
}`;

    // 调用 LLM（自动选择正确的 API）
    const response = await callVisionLLM(prompt, allImageUrls);

    // 解析返回结果
    const result = robustJsonParse(response.content);

    // 提取各字段，提供默认值
    const company = toText(result.company) || "未知公司";
    const rawPosition = toText(result.position) || "未知岗位";
    const industry = toText(result.industry) || "";
    // AI 可能返回对象/数组，先格式化为纯换行文本
    const content = formatContent(result.content);
    const originalContent = formatContent(result.originalContent);

    // 后处理兜底：从 content 中识别所有轮次，合并到岗位名称
    const position = buildPositionWithRounds(rawPosition, content || originalContent);

    return NextResponse.json({
      success: true,
      data: {
        company,
        position,
        industry,
        content,
        originalContent,
      },
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "识别失败，请重试";
    console.error("Extract API error:", error);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}