import { NextRequest, NextResponse } from "next/server";
import { callVisionLLM, hasLLMConfig, isCozeEnvironment } from "@/lib/llm-client";

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
  // Coze 环境不需要 LLM_API_KEY
  if (isCozeEnvironment()) {
    return { valid: true };
  }
  
  // 自定义 API 环境需要 LLM_API_KEY
  if (hasLLMConfig()) {
    return { valid: true };
  }
  
  return { valid: false, error: '请配置 LLM_API_KEY 环境变量，或确保在 Coze 环境中运行' };
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

    // 清洗规则：只保留面试问题，不删减精简
    const prompt = `你是一个面经整理助手，请从面经图片中提取结构化信息。特别注意：
1. **岗位**字段需要识别出面试轮次（如一面、二面、群面、初面、终面），格式如"产品经理一面"、"数据分析二面"、"群面"等
2. **行业**字段必须从以下列表中选择，如果没有合适的就留空：
   互联网、科技、电商、金融、券商、基金、银行、快消、零售、奢侈品、咨询、综合、通信、物流、交通、医药、制造、能源、保险、房地产、广告、公关、生物、机械、环境、材料、化工、石油、建筑、游戏、高校、商业服务、航天、设计、环保、耐消、餐饮、供应链、维修、物业、体育、酒店、人力、会计师事务所、电气、轻工业、钢铁、贸易、律所、汽车、文旅、食品、农业、新能源、教育、传媒
3. **内容**字段只提取面试问题，不要包含答案、寒暄、水话、广告等内容
4. **重要**：面试问题必须完整保留，不允许删减、精简、合并或省略任何问题，保持原汁原味
5. 如果是多张图片，请合并所有图片中的信息

请以 JSON 格式输出（不要包裹在 markdown 代码块中）：
{
  "company": "公司名称",
  "position": "岗位名称（含轮次，如'产品经理一面'）",
  "industry": "行业（必须从上述列表选择，没有合适的留空字符串）",
  "content": "清洗后的面经内容（只含完整面试问题）",
  "originalContent": "原始面经内容（完整保留）"
}`;

    // 调用 LLM（自动选择正确的 API）
    const response = await callVisionLLM(prompt, allImageUrls);

    // 解析返回结果
    const result = robustJsonParse(response.content);

    // 提取各字段，提供默认值
    const company = (result.company as string) || "未知公司";
    const position = (result.position as string) || "未知岗位";
    const industry = (result.industry as string) || "";
    const content = (result.content as string) || "";
    const originalContent = (result.originalContent as string) || "";

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