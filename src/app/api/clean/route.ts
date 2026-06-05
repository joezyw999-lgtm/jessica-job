import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import type { Message } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  try {
    const { content } = await request.json();

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "缺少面经内容" },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const systemPrompt = `你是一个面经内容清洗专家。你的任务是清洗面经文本，只保留有效的面试信息。

清洗规则：
1. **删除无效内容**：去掉寒暄语、表情符号、无关闲聊、广告推广、水印文字
2. **保留有效信息**：面试问题、技术问题、回答要点、面试流程、薪资信息、面试轮次等
3. **结构化整理**：如果内容杂乱，按面试轮次或主题分类整理
4. **保持原意**：不添加原文没有的信息，不改变原意
5. **简洁表达**：去除冗余表述，保留核心信息

请直接返回清洗后的纯文本内容，不要添加任何格式标记或说明文字。`;

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `请清洗以下面经内容，只保留有效面试信息：\n\n${content}`,
      },
    ];

    const response = await client.invoke(messages, {
      model: "doubao-seed-2-0-lite-260215",
      temperature: 0.2,
    });

    return NextResponse.json({
      success: true,
      data: {
        cleanedContent: response.content,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "内容清洗失败，请重试";
    console.error("Clean API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
