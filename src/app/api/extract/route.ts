import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import type { Message } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: "缺少图片地址" },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const industryList = "互联网、科技、电商、金融、券商、基金、银行、快消、零售、奢侈品、四大、咨询、综合、通信、物流、交通、医药、制造、能源、保险、八大、房地产、广告、公关、生物、机械、环境、材料、化工、石油、建筑、游戏、高校、商业服务、航天、设计、环保、耐消、餐饮、供应链、维修、物业、体育、酒店、人力、会计师事务所、电气、轻工业、钢铁、贸易、律所、汽车、文旅、食品、农业、新能源、教育";

    const systemPrompt = `你是一个面经信息提取专家。用户会给你一张面经截图（面试经验分享的图片），你需要从中提取以下结构化信息：

1. **company**（公司名称）：面经中提到的公司名。如果图片中无法识别出公司名，填"未知"
2. **position**（岗位名称）：面经中提到的应聘岗位。如果无法识别，填"未知"
3. **industry**（行业）：根据识别到的公司名称，判断该公司所属的行业。你必须从以下行业列表中选择最匹配的一个，不允许返回列表之外的行业：
${industryList}
如果无法判断，填"综合"
4. **content**（面经内容）：完整提取面经中的所有文字内容，保持原始结构

请严格按照以下 JSON 格式返回，不要添加任何其他文字说明：
{
  "company": "公司名称",
  "position": "岗位名称",
  "industry": "行业",
  "content": "面经的完整文字内容"
}`;

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "请识别这张面经图片，提取其中的公司、岗位和面经内容信息。",
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
              detail: "high",
            },
          },
        ],
      },
    ];

    const response = await client.invoke(messages, {
      model: "doubao-seed-2-0-pro-260215",
      temperature: 0.2,
    });

    // 清理 AI 返回中的控制字符，防止 JSON.parse 失败
    const sanitizeJsonStr = (str: string): string => {
      // 先提取 JSON 部分
      let jsonStr = str.trim();
      // 尝试从 markdown 代码块中提取
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      } else {
        // 尝试提取花括号包围的 JSON 对象
        const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          jsonStr = braceMatch[0];
        }
      }
      // 转义 JSON 字符串值中的控制字符（换行、制表符等）
      // 在双引号内的裸换行/制表符替换为转义形式
      return jsonStr
        .replace(/\t/g, "\\t")
        .replace(/\r\n/g, "\\n")
        .replace(/\r/g, "\\n")
        .replace(/\n/g, "\\n");
    };

    // 尝试解析 AI 返回的 JSON
    let result;
    try {
      result = JSON.parse(sanitizeJsonStr(response.content));
    } catch {
      // 如果仍然失败，尝试更激进的方式：逐个提取字段值
      try {
        const companyMatch = response.content.match(/"company"\s*:\s*"([\s\S]*?)"\s*[,}]/);
        const positionMatch = response.content.match(/"position"\s*:\s*"([\s\S]*?)"\s*[,}]/);
        const industryMatch = response.content.match(/"industry"\s*:\s*"([\s\S]*?)"\s*[,}]/);
        const contentMatch = response.content.match(/"content"\s*:\s*"([\s\S]*)"\s*}\s*$/);

        result = {
          company: companyMatch ? companyMatch[1] : "未知",
          position: positionMatch ? positionMatch[1] : "未知",
          industry: industryMatch ? industryMatch[1] : "综合",
          content: contentMatch ? contentMatch[1] : response.content,
        };
      } catch {
        return NextResponse.json(
          { error: "AI 返回格式无法解析", raw: response.content },
          { status: 500 }
        );
      }
    }

    // 校验必要字段
    if (!result.company && !result.position && !result.content) {
      return NextResponse.json(
        { error: "无法从图片中识别出面经信息", raw: response.content },
        { status: 422 }
      );
    }

    // 第二步：清洗面经内容
    let cleanedContent = result.content || "";
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
      cleanedContent = cleanResponse.content;
    } catch {
      // 清洗失败时使用原始内容
      console.error("Clean step failed, using original content");
    }

    return NextResponse.json({
      success: true,
      data: {
        company: result.company || "未知",
        position: result.position || "未知",
        industry: result.industry || "综合",
        content: cleanedContent,
        originalContent: result.content || "",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "面经识别失败，请重试";
    console.error("Extract API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
