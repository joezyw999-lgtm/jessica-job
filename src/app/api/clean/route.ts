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

    const systemPrompt = `请帮我从文本中清洗面试经验。只去除截图时间、水印、错别字波浪线、无关排版等非内容信息；面试经验中关于面试问题的内容禁止删减、可做微小表达的调整、不能改写、不能合并，必须按原顺序完整保留。

需要提取并保留：
1. 公司/岗位/面试轮次等信息；
2. 所有面试问题、追问；
3. 所有反问内容。

特别要求：
如果出现"反问"，必须保留"反问"两个字作为标题，并说明这是候选人向面试官提问的环节，不能改成"提问环节"或删除。

删除规则：
· 删除截图时间、手机状态栏、系统时间、电量、信号、页面顶部或底部无关信息；
· 删除水印、平台按钮、点赞、收藏、评论、分享、关注、头像、昵称等与面试经验无关的界面元素；
· 删除 OCR 识别的非面试相关的内容；
· 删除无意义空行、断裂换行；
· 删除广告、推荐语、平台引导语、无关标题或无关说明；
· 删除与面试经验无关的发布时间、截图时间、面试答案、面试体验这类内容。

输出格式：
公司-岗位-其他描述词
1.
2.
3.
4.反问：

请直接返回清洗后的内容，不要添加任何额外说明。`;

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
