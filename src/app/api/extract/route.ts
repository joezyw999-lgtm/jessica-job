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

    const systemPrompt = `你是一个面经信息提取专家。用户会给你一张面经截图（面试经验分享的图片），你需要从中提取以下结构化信息：

1. **company**（公司名称）：面经中提到的公司名。如果图片中无法识别出公司名，填"未知"
2. **position**（岗位名称）：面经中提到的应聘岗位。如果无法识别，填"未知"
3. **content**（面经内容）：完整提取面经中的所有文字内容，保持原始结构

请严格按照以下 JSON 格式返回，不要添加任何其他文字说明：
{
  "company": "公司名称",
  "position": "岗位名称",
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

    // 尝试解析 AI 返回的 JSON
    let result;
    try {
      // 尝试直接解析
      result = JSON.parse(response.content);
    } catch {
      // 尝试从 markdown 代码块中提取 JSON
      const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1].trim());
      } else {
        // 最后尝试从文本中提取 JSON 对象
        const braceMatch = response.content.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          result = JSON.parse(braceMatch[0]);
        } else {
          return NextResponse.json(
            { error: "AI 返回格式无法解析", raw: response.content },
            { status: 500 }
          );
        }
      }
    }

    // 校验必要字段
    if (!result.company && !result.position && !result.content) {
      return NextResponse.json(
        { error: "无法从图片中识别出面经信息", raw: response.content },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        company: result.company || "未知",
        position: result.position || "未知",
        content: result.content || "",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "面经识别失败，请重试";
    console.error("Extract API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
