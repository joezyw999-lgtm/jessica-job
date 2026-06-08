import { NextRequest, NextResponse } from "next/server";
import { SearchClient, Config, LLMClient, HeaderUtils, Message } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  try {
    const { title } = await request.json();
    if (!title || typeof title !== "string") {
      return NextResponse.json({ success: false, error: "请提供招聘标题" }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();

    // Step 1: Web search for recruitment info
    const searchClient = new SearchClient(config, customHeaders);
    const searchResponse = await searchClient.advancedSearch(title, {
      searchType: "web",
      count: 10,
      needContent: true,
      needUrl: true,
      needSummary: true,
    });

    if (!searchResponse.web_items || searchResponse.web_items.length === 0) {
      return NextResponse.json({
        success: false,
        error: "未找到相关招聘信息",
      });
    }

    // Combine search results into context
    const searchContext = searchResponse.web_items
      .map((item, i) => `[${i + 1}] ${item.title}\n${item.snippet}\n${item.content || ""}`)
      .join("\n\n");

    // Step 2: Use LLM to extract structured recruitment info
    const llmClient = new LLMClient(config, customHeaders);
    const extractPrompt = `你是一个招聘信息提取专家。根据以下搜索结果，提取与标题"${title}"相关的招聘信息。

请从搜索结果中提取以下字段，以JSON格式返回：
{
  "company": "公司名称",
  "enterpriseType": "企业性质（国企/民企/外企/合资等）",
  "recruitmentType": "招聘类型（校招/社招/实习/秋招/春招等）",
  "industry": "所属行业",
  "topic": "招聘主题/标题",
  "updateTime": "更新时间",
  "deadline": "网申截止时间",
  "target": "招聘对象（如：2025届毕业生、社会人才等）",
  "hasReferral": "是否有内推",
  "location": "工作地点",
  "position": "招聘岗位",
  "requirement": "招聘需求/要求",
  "applyUrl": "网申链接"
}

规则：
1. 只提取确定的信息，不确定的留空字符串
2. 如果搜索结果中没有相关信息，对应字段填""
3. 网申链接优先从搜索结果的URL中获取
4. 招聘需求要简洁概括，不需要逐字复制

搜索结果：
${searchContext}

请直接返回JSON，不要用markdown代码块包裹。`;

    const messages: Message[] = [
      { role: "user", content: extractPrompt },
    ];

    const llmResponse = await llmClient.invoke(messages, {
      model: "doubao-seed-2-0-lite-260215",
    });

    let result: Record<string, string> = {};
    try {
      let content = (llmResponse.content || "").trim();
      // Remove markdown code block if present
      content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
      // Sanitize control characters
      content = content.replace(/[\x00-\x1f\x7f]/g, (ch: string) => {
        if (ch === "\n" || ch === "\r" || ch === "\t") return ch;
        return "";
      });
      result = JSON.parse(content);
    } catch {
      // If JSON parsing fails, return raw search results
      return NextResponse.json({
        success: false,
        error: "结构化提取失败，请重试",
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "识别失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
