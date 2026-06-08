import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { LLMClient, Config } from "coze-coding-dev-sdk";
import type { Message } from "coze-coding-dev-sdk";

const supabase = getSupabaseClient();

const config = new Config({
  apiKey: process.env.COZE_WORKLOAD_IDENTITY_API_KEY || "",
  baseUrl: process.env.COZE_INTEGRATION_BASE_URL || "",
});

const RECRUITMENT_MODEL = "doubao-seed-2-0-pro-260215";
const OCR_MODEL = "doubao-seed-2-0-pro-260215";

interface ImportRequest {
  sourceUrl: string;
  title: string;
  accountName: string;
  publishTime: string;
  contentText: string;
  contentHtml: string;
  imageUrls: string[];
  importMethod: string;
  importedAt: string;
  deviceId: string;
}

// Sanitize JSON string from LLM output
function sanitizeJsonStr(str: string): string {
  // Remove markdown code block wrappers
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Escape control characters that break JSON.parse
  cleaned = cleaned.replace(/[\x00-\x1f]/g, (ch: string) => {
    const code = ch.charCodeAt(0);
    if (code === 0x0a) return "\\n"; // newline
    if (code === 0x0d) return "\\r"; // carriage return
    if (code === 0x09) return "\\t"; // tab
    return "\\u" + code.toString(16).padStart(4, "0");
  });

  return cleaned;
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// OCR images using vision model
async function ocrImages(
  imageUrls: string[]
): Promise<
  { imageUrl: string; ocrText: string; confidence: number; status: string }[]
> {
  const results = [];

  for (const url of imageUrls) {
    try {
      const config = new Config();
      const llm = new LLMClient(config, {
        model: OCR_MODEL,
      });

      const messages: Message[] = [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url },
            },
            {
              type: "text",
              text: "请识别这张图片中的所有文字内容，保持原始排版和换行。如果图片中没有文字或无法识别，返回空字符串。只返回识别的文字，不要添加任何解释。",
            },
          ],
        } as unknown as Message,
      ];

      const ocrResponse = await llm.invoke(messages, {
        model: "doubao-seed-2-0-pro-260215",
        temperature: 0.1,
      });

      const ocrText = typeof ocrResponse === "string" ? ocrResponse : JSON.stringify(ocrResponse);

      results.push({
        imageUrl: url,
        ocrText: ocrText.trim(),
        confidence: 0.8,
        status: "success",
      });
    } catch {
      results.push({
        imageUrl: url,
        ocrText: "",
        confidence: 0,
        status: "failed",
      });
    }
  }

  return results;
}

// Extract structured recruitment info using LLM
async function extractRecruitmentInfo(params: {
  sourceUrl: string;
  title: string;
  accountName: string;
  publishTime: string;
  contentText: string;
  imageOcrResults: { imageUrl: string; ocrText: string }[];
  qrCodeLinks: { imageUrl: string; content: string }[];
}): Promise<{
  items: Record<string, unknown>[];
  warnings: string[];
}> {
  const config2 = new Config();
  const llm = new LLMClient(config2, {
    model: RECRUITMENT_MODEL,
  });

  const ocrContent = params.imageOcrResults
    .filter((r) => r.ocrText.trim())
    .map((r, i) => `【图片${i + 1} OCR内容】\n${r.ocrText}`)
    .join("\n\n");

  const qrContent = params.qrCodeLinks.length
    ? params.qrCodeLinks
        .map(
          (r, i) =>
            `【二维码${i + 1}】来源图片: ${r.imageUrl}, 识别内容: ${r.content}`
        )
        .join("\n")
    : "未识别到二维码";

  const prompt = `你是一个专业的招聘信息提取助手。请从以下公众号文章内容中提取结构化招聘信息。

## 输入内容

### 文章信息
- 标题: ${params.title || "未知"}
- 公众号: ${params.accountName || "未知"}
- 发布时间: ${params.publishTime || "未知"}
- 来源URL: ${params.sourceUrl || "未知"}

### 正文内容
${params.contentText || "(正文为空)"}

### 图片OCR内容
${ocrContent || "(无图片OCR内容)"}

### 二维码识别结果
${qrContent}

## 提取规则

1. 不允许编造信息。不确定的字段返回 null。
2. 如果正文和OCR信息冲突，优先使用更明确的信息。
3. 如果网申链接来自二维码，在 warnings 中标记"网申链接来自二维码识别，建议人工确认"。
4. 如果截止时间缺失，返回 null，不要根据招聘年份推测。
5. 如果只识别到"点击阅读原文"但没有具体链接，applicationUrl 返回 null。
6. 如果文章是招聘合集，包含多家公司，应返回多条招聘记录（items数组）。
7. 如果是单家公司多岗位招聘，返回一条记录，岗位字段使用数组。
8. 每个关键字段尽量给出来源(正文/OCR/二维码/公众号标题)。
9. 如果信息不足以判断企业性质、行业等字段，返回 null。
10. 招聘类型仅限: 校招、社招、实习、春招、秋招、宣讲会、内推、其他。
11. 企业性质仅限: 国企、央企、外企、民企、事业单位、合资、其他。

## 输出格式

必须返回严格JSON，不要返回Markdown代码块，不要返回解释性文本：

{
  "items": [
    {
      "companyName": "公司名称",
      "companyType": "企业性质",
      "recruitmentType": "招聘类型",
      "industry": "行业",
      "theme": "招聘主题",
      "deadline": "截止时间",
      "targetCandidates": "招聘对象",
      "referral": "内推信息",
      "locations": ["工作地点1", "工作地点2"],
      "positions": ["岗位1", "岗位2"],
      "requirements": "岗位要求",
      "applicationUrl": "网申链接",
      "sourceUrl": "${params.sourceUrl}",
      "sourceType": "wechat_article",
      "confidence": 0.85,
      "fieldSources": {
        "companyName": "正文",
        "deadline": "OCR",
        "applicationUrl": "二维码"
      },
      "warnings": []
    }
  ],
  "warnings": ["全局风险提示"]
}`;

  const messages: Message[] = [
    {
      role: "user",
      content: prompt,
    } as unknown as Message,
  ];

  let responseText: string;
  try {
    const llmResponse = await llm.invoke(messages, {});
    responseText = llmResponse.content;
  } catch {
    return { items: [], warnings: ["LLM调用失败"] };
  }

  try {
    const cleaned = sanitizeJsonStr(responseText);
    const parsed = JSON.parse(cleaned);
    return {
      items: parsed.items || [],
      warnings: parsed.warnings || [],
    };
  } catch {
    // Retry with repair attempt
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const cleaned = sanitizeJsonStr(jsonMatch[0]);
        const parsed = JSON.parse(cleaned);
        return {
          items: parsed.items || [],
          warnings: parsed.warnings || [],
        };
      }
    } catch {
      // Give up
    }
    return {
      items: [],
      warnings: ["LLM返回格式错误，请重试"],
    };
  }
}

// CORS headers for bookmarklet requests from weixin articles
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body: ImportRequest = await request.json();
    const {
      sourceUrl,
      title,
      accountName,
      publishTime,
      contentText,
      imageUrls = [],
      importMethod = "bookmarklet",
      deviceId,
    } = body;

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "缺少 deviceId" },
        { status: 400, headers: corsHeaders }
      );
    }

    const taskId = `wechat_${generateId()}`;

    // 1. Create import task
    const { error: taskError } = await supabase
      .from("wechat_import_tasks")
      .insert({
        id: taskId,
        device_id: deviceId,
        source_url: sourceUrl,
        title,
        account_name: accountName,
        publish_time: publishTime,
        content_text: contentText,
        content_html: body.contentHtml,
        import_method: importMethod,
        status: "processing",
      });

    if (taskError) {
      console.error("Task creation error:", taskError);
      return NextResponse.json(
        { success: false, error: "创建任务失败" },
        { status: 500, headers: corsHeaders }
      );
    }

    // 2. OCR images (using vision model)
    let imageOcrResults: { imageUrl: string; ocrText: string; confidence: number; status: string }[] = [];
    let qrCodeLinks: { imageUrl: string; content: string }[] = [];
    const warnings: string[] = [];

    if (imageUrls.length > 0) {
      // Filter out small images (can't check size server-side, so just process all)
      const validUrls = imageUrls.filter(
        (url) => url && !url.includes("emoji") && !url.includes("icon")
      );

      if (validUrls.length > 0) {
        imageOcrResults = await ocrImages(validUrls);

        // Save OCR results
        for (const result of imageOcrResults) {
          await supabase.from("wechat_import_images").insert({
            id: `img_${generateId()}`,
            task_id: taskId,
            image_url: result.imageUrl,
            ocr_text: result.ocrText,
            ocr_confidence: result.confidence,
            status: result.status,
          });
        }

        // Note: QR code recognition would require a dedicated QR library
        // For MVP, we'll rely on OCR to detect QR-related text patterns
        // and let LLM infer application URLs from content
        const ocrTexts = imageOcrResults
          .filter((r) => r.ocrText.trim())
          .map((r) => r.ocrText);

        // Simple QR URL detection from OCR text
        for (const text of ocrTexts) {
          const urlMatches = text.match(
            /https?:\/\/[^\s<>"{}|\\^`[\]]+/g
          );
          if (urlMatches) {
            for (const url of urlMatches) {
              qrCodeLinks.push({
                imageUrl: "ocr_detected",
                content: url,
              });
            }
          }
        }

        const failedOcr = imageOcrResults.filter(
          (r) => r.status === "failed"
        );
        if (failedOcr.length > 0) {
          warnings.push(`${failedOcr.length}张图片OCR失败`);
        }
      }
    }

    if (!contentText?.trim() && imageOcrResults.length === 0) {
      warnings.push("正文为空且无图片OCR结果");
    } else if (!contentText?.trim() && imageOcrResults.length > 0) {
      warnings.push("正文为空，当前结果主要来自图片OCR");
    }

    // 3. Update task status
    await supabase
      .from("wechat_import_tasks")
      .update({ status: "ocr_done" })
      .eq("id", taskId);

    // 4. LLM extraction
    const extractionResult = await extractRecruitmentInfo({
      sourceUrl,
      title,
      accountName,
      publishTime,
      contentText: contentText || "",
      imageOcrResults: imageOcrResults.map((r) => ({
        imageUrl: r.imageUrl,
        ocrText: r.ocrText,
      })),
      qrCodeLinks,
    });

    const allWarnings = [...warnings, ...extractionResult.warnings];

    // 5. Save recruitment records
    const records = [];
    for (const item of extractionResult.items) {
      const recordId = generateId();
      const record = {
        id: recordId,
        device_id: deviceId,
        task_id: taskId,
        company_name: (item.companyName as string) || null,
        company_type: (item.companyType as string) || null,
        recruitment_type: (item.recruitmentType as string) || null,
        industry: (item.industry as string) || null,
        theme: (item.theme as string) || null,
        deadline: (item.deadline as string) || null,
        target_candidates: (item.targetCandidates as string) || null,
        referral: (item.referral as string) || null,
        locations: JSON.stringify(item.locations || []),
        positions: JSON.stringify(item.positions || []),
        requirements: (item.requirements as string) || null,
        application_url: (item.applicationUrl as string) || null,
        source_url: sourceUrl,
        source_type: "wechat_article",
        confidence: (item.confidence as number) || 0,
        field_sources: JSON.stringify(item.fieldSources || {}),
        warnings: JSON.stringify(
          [...(item.warnings as string[] || []), ...allWarnings]
        ),
        raw_llm_output: null,
        confirmed: false,
      };

      const { error: insertError } = await supabase
        .from("recruitment_records")
        .insert(record);

      if (!insertError) {
        records.push({
          ...record,
          locations: item.locations || [],
          positions: item.positions || [],
          fieldSources: item.fieldSources || {},
          warnings: [...(Array.isArray(item.warnings) ? item.warnings : []), ...allWarnings],
        });
      }
    }

    // 6. Update task as completed
    await supabase
      .from("wechat_import_tasks")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    return NextResponse.json({
      success: true,
      data: {
        taskId,
        status: "completed",
        records,
        warnings: allWarnings,
      },
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error("Wechat import error:", error);
    const message =
      error instanceof Error ? error.message : "导入处理失败";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}
