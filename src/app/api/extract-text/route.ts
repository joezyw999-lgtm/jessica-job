import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import type { Message } from "coze-coding-dev-sdk";

function sanitizeJsonStr(str: string): string {
  return str
    .replace(/\t/g, "\\t")
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/[\x00-\x1f]/g, (ch) => {
      const code = ch.charCodeAt(0);
      if (code === 10 || code === 13 || code === 9) return ch;
      return "\\u" + ("0000" + code.toString(16)).slice(-4);
    });
}

function extractField(jsonStr: string, fieldName: string): string {
  const regex = new RegExp(`"${fieldName}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "s");
  const match = jsonStr.match(regex);
  if (match) {
    return match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return "";
}

const INDUSTRY_LIST = "互联网、科技、电商、金融、券商、基金、银行、快消、零售、奢侈品、四大、咨询、综合、通信、物流、交通、医药、制造、能源、保险、八大、房地产、广告、公关、生物、机械、环境、材料、化工、石油、建筑、游戏、高校、商业服务、航天、设计、环保、耐消、餐饮、供应链、维修、物业、体育、酒店、人力、会计师事务所、电气、轻工业、钢铁、贸易、律所、汽车、文旅、食品、农业、新能源、教育";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body as { text: string };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "请提供有效的面经文字内容" }, { status: 400 });
    }

    const client = new LLMClient();

    // 第一步：从文字中提取结构化信息
    const systemPrompt = `你是一个面经信息提取专家。你的任务是从面经文字中提取以下结构化信息：

1. **company**（公司名称）：识别面经所属的公司名称
2. **position**（岗位名称）：识别面经所属的岗位名称
3. **industry**（行业）：根据公司名称判断所属行业，只能从以下行业列表中选择最匹配的一个：${INDUSTRY_LIST}。如果无法判断则填"综合"
4. **content**（面经原始内容）：提取面经的完整文字内容
5. **category**（面经类别）：默认填"国内"
6. **experienceType**（类型）：判断是"面经"还是"笔经"，面经指面试经验，笔经指笔试经验。大部分都是面经，根据内容分析判断
7. **country**（国家）：默认填"大陆"

请以 JSON 格式返回，格式如下：
{"company": "公司名", "position": "岗位名", "industry": "行业", "content": "面经原始内容", "category": "国内", "experienceType": "面经", "country": "大陆"}

注意：
- 如果无法识别公司名称，company 填"未知"
- 如果无法识别岗位名称，position 填"未知"
- content 字段保留原始面经的完整文字内容
- 只返回 JSON，不要添加任何其他说明文字`;

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `请从以下面经文字中提取结构化信息：\n\n${text.trim()}`,
      },
    ];

    const response = await client.invoke(messages, {
      model: "doubao-seed-2-0-lite-260215",
      temperature: 0.2,
    });

    // 解析 AI 返回的 JSON
    let result: Record<string, string> = {};
    const content = response.content || "";

    // 尝试提取 JSON
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);

    if (braceMatch) {
      const sanitized = sanitizeJsonStr(braceMatch[0]);
      try {
        result = JSON.parse(sanitized);
      } catch {
        // 二级兜底：逐字段提取
        const raw = braceMatch[0];
        result = {
          company: extractField(raw, "company") || "未知",
          position: extractField(raw, "position") || "未知",
          industry: extractField(raw, "industry") || "综合",
          content: extractField(raw, "content") || text,
          category: extractField(raw, "category") || "国内",
          experienceType: extractField(raw, "experienceType") || "面经",
          country: extractField(raw, "country") || "大陆",
        };
      }
    }

    // 填充默认值
    result.company = result.company || "未知";
    result.position = result.position || "未知";
    result.industry = result.industry || "综合";
    result.content = result.content || text;
    result.category = result.category || "国内";
    result.experienceType = result.experienceType || "面经";
    result.country = result.country || "大陆";

    // 如果没有有效内容
    if (!result.content || result.content.trim().length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          company: "未知",
          position: "未知",
          industry: "综合",
          content: "无有效面试信息",
          originalContent: text,
          category: "国内",
          experienceType: "面经",
          country: "大陆",
        },
      });
    }

    // 第二步：清洗面经内容
    let cleanedContent = result.content;
    try {
      const cleanSystemPrompt = `你是一个面经内容清洗专家。你的任务是清洗面经文本，只保留有效的面试信息。

清洗规则：
1. **删除无效内容**：去掉寒暄语、表情符号、无关闲聊、广告推广、水印文字
2. **保留有效信息**：面试问题、技术问题、回答要点、面试流程、薪资信息、面试轮次等
3. **结构化整理**：如果内容杂乱，按面试轮次或主题分类整理
4. **保持原意**：不添加原文没有的信息，不改变原意
5. **简洁表达**：去除冗余表述，保留核心信息
6. **删除时间线和进度说明**：去掉关于面试时间线、个人面试进度、流程推进状态的描述（如"等了一周收到通知"、"已OC"、"进入二面流程"等），只保留面试本身的问题和内容

请直接返回清洗后的纯文本内容，不要添加任何格式标记或说明文字。`;

      const cleanMessages: Message[] = [
        { role: "system", content: cleanSystemPrompt },
        {
          role: "user",
          content: `请清洗以下面经内容，只保留有效面试信息：\n\n${cleanedContent}`,
        },
      ];

      const cleanResponse = await client.invoke(cleanMessages, {
        model: "doubao-seed-2-0-lite-260215",
        temperature: 0.2,
      });

      if (cleanResponse.content && cleanResponse.content.trim()) {
        cleanedContent = cleanResponse.content.trim();
      }
    } catch {
      // 清洗失败时保留原始提取内容
    }

    return NextResponse.json({
      success: true,
      data: {
        company: result.company,
        position: result.position,
        industry: result.industry,
        content: cleanedContent,
        originalContent: result.content,
        category: result.category,
        experienceType: result.experienceType,
        country: result.country,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "文字识别失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
