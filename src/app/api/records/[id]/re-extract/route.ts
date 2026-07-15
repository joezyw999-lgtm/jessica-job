import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { callVisionLLM, callLLM, hasLLMConfig } from '@/lib/llm-client';
import { buildPositionWithRounds } from '@/lib/utils';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-device-id',
};

const INDUSTRY_LIST = "互联网、科技、电商、金融、券商、基金、银行、快消、零售、奢侈品、咨询、综合、通信、物流、交通、医药、制造、能源、保险、房地产、广告、公关、生物、机械、环境、材料、化工、石油、建筑、游戏、高校、商业服务、航天、设计、环保、耐消、餐饮、供应链、维修、物业、体育、酒店、人力、会计师事务所、电气、轻工业、钢铁、贸易、律所、汽车、文旅、食品、农业、新能源、教育、传媒";

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// 健壮的 JSON 解析
function robustJsonParse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch { /* fallthrough */ }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch { /* fallthrough */ }
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch { /* fallthrough */ }
  }

  return {};
}

// POST /api/records/[id]/re-extract - 重新识别面经
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!hasLLMConfig()) {
      return NextResponse.json(
        { error: '请配置 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL 环境变量' },
        { status: 500, headers: corsHeaders }
      );
    }

    const { id } = await params;
    const client = getSupabaseClient();
    const deviceId = request.headers.get('x-device-id');

    // 1. 查询当前记录
    let query = client
      .from('mianjing_records')
      .select('*')
      .eq('id', id);
    if (deviceId) {
      query = query.eq('device_id', deviceId);
    }

    const { data: record, error: queryError } = await query.single();

    if (queryError || !record) {
      return NextResponse.json(
        { error: '记录不存在' },
        { status: 404, headers: corsHeaders }
      );
    }

    // 2. 判断类型并重新识别
    let imageUrls: string[] = [];
    try {
      const raw = record.image_urls;
      if (raw) {
        imageUrls = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(imageUrls)) imageUrls = [];
      }
    } catch {
      imageUrls = [];
    }

    const hasImage = imageUrls.length > 0 || record.image_url;
    const hasText = !!record.original_content;

    let extracted: {
      company: string;
      position: string;
      industry: string;
      content: string;
      originalContent: string;
      category: string;
      experienceType: string;
      country: string;
    };

    if (hasImage) {
      // 图片识别
      const urls = imageUrls.length > 0 ? imageUrls : [record.image_url];
      const isMultiImage = urls.length > 1;

      const prompt = `你是一个面经整理助手，请从面经图片中提取结构化信息。特别注意：

${isMultiImage ? `⚠️ 共有 ${urls.length} 张图片，属于同一条面经的连续截图（按从上到下 / 从左到右的顺序排列）。请按图片顺序完整读取所有内容，合并为一条面经记录。不要拆分成多条记录，不要遗漏任何面试问题，不要重复记录同一问题。\n` : ""}

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
   ${INDUSTRY_LIST}
3. **内容**字段只提取面试问题，不要包含答案、寒暄、水话、广告等内容
4. **重要**：面试问题必须完整保留，不允许删减、精简、合并或省略任何问题，保持原汁原味${isMultiImage ? "，注意跨图片的问题不要拆断" : ""}
5. **多轮面试**：如果面经包含多轮（一面/二面/三面/HR面/终面等），必须按轮次分别列出，每轮有独立编号，标注清楚"【一面】"、"【二面】"等轮次名称，不得混合编号
6. **追问**：追问必须紧跟在对应问题之下，标明"追问"
7. **反问**：必须保留"反问"二字，每轮面试的反问归属于对应轮次，在该轮末尾列出

请以 JSON 格式输出（不要包裹在 markdown 代码块中）：
{
  "company": "公司名称",
  "position": "岗位名称（含完整轮次）",
  "industry": "行业（必须从上述列表选择，没有合适的留空字符串）",
  "content": "清洗后的面经内容（只含完整面试问题，多轮面试需分轮次标注）",
  "originalContent": "原始面经内容（完整保留）"
}`;

      const response = await callVisionLLM(prompt, urls);
      const result = robustJsonParse(response.content);

      const rawPosition = (result.position as string) || "未知岗位";
      const content = (result.content as string) || "";
      const originalContent = (result.originalContent as string) || "";
      const position = buildPositionWithRounds(rawPosition, content || originalContent);

      extracted = {
        company: (result.company as string) || "未知公司",
        position,
        industry: (result.industry as string) || "",
        content,
        originalContent,
        category: record.category || "国内",
        experienceType: record.experience_type || "面经",
        country: record.country || "大陆",
      };

    } else if (hasText) {
      // 文本识别 + 清洗
      const text = record.original_content as string;

      const systemPrompt = `你是一个面经信息提取专家。你的任务是从面经文字中提取以下结构化信息：

1. **company**（公司名称）：识别面经所属的公司名称
2. **position**（岗位+完整轮次）：识别面经所属的岗位名称，必须包含所有出现的面试轮次信息。
   - 单轮：如"产品经理一面"、"数据分析二面"
   - 多轮：把所有出现的轮次合并，如一面+二面 → "产品经理一二面"，一面+二面+HR面 → "产品经理一二面+HR面"，一面+二面+三面+终面 → "产品经理一二三面+终面"
   - 识别不到岗位但有轮次："未知岗位一二三面"
   - 岗位和轮次都识别不到："未知岗位"
3. **industry**（行业）：根据公司名称判断所属行业，只能从以下行业列表中选择最匹配的一个：${INDUSTRY_LIST}。如果无法判断则填"综合"
4. **content**（面经原始内容）：提取面经的完整文字内容
5. **category**（面经类别）：默认填"国内"
6. **experienceType**（类型）：判断是"面经"还是"笔经"，面经指面试经验，笔经指笔试经验。大部分都是面经，根据内容分析判断
7. **country**（国家）：默认填"大陆"

请以 JSON 格式返回，格式如下：
{"company": "公司名", "position": "岗位名称+完整轮次", "industry": "行业", "content": "面经原始内容", "category": "国内", "experienceType": "面经", "country": "大陆"}

注意：
- 如果无法识别公司名称，company 填"未知"
- 如果无法识别岗位名称，position 填"未知岗位"
- content 字段保留原始面经的完整文字内容
- 只返回 JSON，不要添加任何其他说明文字`;

      const userPrompt = `请从以下面经文字中提取结构化信息：\n\n${text.trim()}`;

      const response = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      const result = robustJsonParse(response.content || "");
      const rawPosition = (result.position as string) || "未知岗位";
      const originalContent = (result.content as string) || text;

      // 清洗内容
      let cleanedContent = originalContent;
      try {
        const cleanSystemPrompt = `你是一个面经内容清洗专家。你的任务是清洗面经文本，只保留有效的面试信息。

清洗规则：
1. **删除无效内容**：去掉寒暄语、表情符号、无关闲聊、广告推广、水印文字
2. **只保留面试问题**：只提取面试中被问到的问题，不需要总结、概括或保留面试者的回答要点、回答内容
3. **结构化整理**：按面试轮次分类整理问题，标注清楚"【一面】"、"【二面】"、"【三面】"、"【HR面】"、"【终面】"、"【群面】"等轮次名称
4. **保持原意**：不添加原文没有的信息，不改变原问题意思
5. **保留完整问题**：不允许删减或精简面试问题，必须保留问题的完整表述，包括追问和子问题
6. **删除时间线和进度说明**：去掉关于面试时间线、个人面试进度、流程推进状态的描述，只保留面试本身的问题
7. **删除回答内容**：面试者分享的自己的回答、经验总结、建议等不要保留，只保留面试官提出的问题
8. **禁止省略**：即使问题很多，也不得用"等"、"省略部分问题"等方式省略，必须逐条完整保留
9. **多轮面试编号独立**：每一轮面试的问题独立编号，不要跨轮次连续编号
10. **追问归位**：追问必须紧跟在对应问题之下，标明"追问："，不得单独列出
11. **反问保留**：必须保留"反问"二字，每轮的反问归属于对应轮次，在该轮末尾单独列出，不得和面试官的问题混在一起
12. **面试形式保留**：如果原文提到是电话面、视频面、现场面等形式，在轮次标题中标注，如"【一面（视频面）】"

只输出清洗后的内容，不要添加任何额外说明。`;

        const cleanResponse = await callLLM([
          { role: 'system', content: cleanSystemPrompt },
          { role: 'user', content: `请清洗以下面经内容：\n\n${originalContent}` },
        ]);

        if (cleanResponse.content && cleanResponse.content.trim()) {
          cleanedContent = cleanResponse.content.trim();
        }
      } catch {
        // 清洗失败保留原始内容
      }

      const position = buildPositionWithRounds(rawPosition, cleanedContent || originalContent);

      extracted = {
        company: (result.company as string) || "未知",
        position,
        industry: (result.industry as string) || "综合",
        content: cleanedContent,
        originalContent,
        category: (result.category as string) || "国内",
        experienceType: (result.experienceType as string) || "面经",
        country: (result.country as string) || "大陆",
      };

    } else {
      return NextResponse.json(
        { error: '该记录没有图片也没有原始内容，无法重新识别' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 3. 更新记录
    const updateData: Record<string, string> = {
      company: extracted.company,
      position: extracted.position,
      industry: extracted.industry,
      content: extracted.content,
      original_content: extracted.originalContent,
      category: extracted.category,
      experience_type: extracted.experienceType,
      country: extracted.country,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await client
      .from('mianjing_records')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      throw new Error(`更新失败: ${updateError.message}`);
    }

    // 4. 返回更新后的记录（camelCase）
    return NextResponse.json({
      success: true,
      data: {
        id,
        imageUrl: record.image_url,
        imageUrls,
        imageFileKey: record.image_file_key,
        fileName: record.file_name,
        company: extracted.company,
        position: extracted.position,
        industry: extracted.industry,
        category: extracted.category,
        experienceType: extracted.experienceType,
        country: extracted.country,
        content: extracted.content,
        originalContent: extracted.originalContent,
        status: record.status,
        deviceId: record.device_id,
        createdAt: record.created_at,
        updatedAt: updateData.updated_at,
      },
    }, { headers: corsHeaders });

  } catch (error: unknown) {
    console.error('Re-extract error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '重新识别失败' },
      { status: 500, headers: corsHeaders }
    );
  }
}
