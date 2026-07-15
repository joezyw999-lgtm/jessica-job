import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm-client";
import type { Message } from "@/lib/llm-client";

export async function POST(request: NextRequest) {
  try {
    const { content } = await request.json();

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "缺少面经内容" },
        { status: 400 }
      );
    }

    const systemPrompt = `请帮我从文本中清洗面试经验。只去除截图时间、水印、错别字波浪线、无关排版等非内容信息；面试经验中关于面试问题的内容禁止删减、可做微小表达的调整、不能改写、不能合并，必须按原顺序完整保留。

需要提取并保留：
1. 公司/岗位/面试轮次等信息；
2. 所有面试问题、追问（追问必须紧跟在对应问题之下，标明"追问"）；
3. 所有反问内容（每轮面试的反问分别列出，归属于对应轮次）；
4. 多轮面试（一面、二面、三面、HR面、终面、群面、技术面、业务面等）必须按轮次分别列出，标注清楚轮次名称和轮次顺序，不得合并到同一列表中；
5. 面试形式（电话面/视频面/现场面/线上笔试等）如文中提到则保留；
6. 面试时长、部门、业务线等背景信息如文中提到则保留。

多轮面试规则：
· 如果面经包含多轮面试（如一面和二面），必须按时间顺序分轮次列出，每一轮有独立的编号体系（一面1.2.3...，二面1.2.3...），不能全部混在一起编号；
· 每轮面试开头标注清楚轮次名称，如"【一面】"、"【二面】"、"【HR面】"、"【终面】"等；
· 每轮面试中的反问归属于该轮，在该轮末尾列出；
· 不同轮次的问题不得混合、不得调换顺序。

特别要求：
如果出现"反问"，必须保留"反问"两个字作为标题，并说明这是候选人向面试官提问的环节，不能改成"提问环节"或删除。

删除规则：
· 删除截图时间、手机状态栏、系统时间、电量、信号、页面顶部或底部无关信息；
· 删除水印、平台按钮、点赞、收藏、评论、分享、关注、头像、昵称等与面试经验无关的界面元素；
· 删除 OCR 识别的非面试相关的内容；
· 删除无意义空行、断裂换行；
· 删除广告、推荐语、平台引导语、无关标题或无关说明；
· 删除面试答案、面试体验感想、情绪表达、寒暄客套、水话；
· 删除面试者的回答思路、解题思路、思考过程、复盘、经验总结；
· 删除"已编辑"、"楼主"、"来自XX"等平台标签。

完整性要求：
· 所有面试问题必须逐条完整保留，不得删减、合并、改写、省略；
· 追问必须保留并紧跟对应主问题；
· 多轮面试不得遗漏任何一轮，轮次顺序必须正确；
· 反问问题必须完整保留，不得删减。

输出格式示例：
公司-岗位
【一面】（xx分钟 / 视频面）
1. 问题1
   追问：追问内容
2. 问题2
3. 反问：
   - 反问问题1
   - 反问问题2

【二面】（xx分钟 / 现场面）
1. 问题1
2. 问题2
   追问：追问内容
3. 反问：
   - 反问问题1

请直接返回清洗后的内容，不要添加任何额外说明。`;

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `请清洗以下面经内容，只保留有效面试信息：\n\n${content}`,
      },
    ];

    const response = await callLLM(messages);

    return NextResponse.json({
      success: true,
      data: {
        cleanedContent: response.content,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "内容清洗失败，请检查 LLM API 配置后重试";
    console.error("Clean API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
