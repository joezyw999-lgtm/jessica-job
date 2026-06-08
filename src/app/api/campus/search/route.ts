import { NextRequest } from "next/server";
import { SearchClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { LLMClient } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 预定义搜索关键词组
const SEARCH_KEYWORDS = [
  "2026 校园招聘",
  "2026 校招",
  "2026 秋招",
  "2026 春招",
  "2026 应届生招聘",
  "2026 管培生",
  "2026 提前批",
  "2026 补录",
  "2027 暑期实习",
  "2027 寒假实习",
  "暑期实习 招聘",
  "留用实习 招聘",
  "校招 正式启动",
  "秋招 正式启动",
  "春招 正式启动",
  "应届生招聘 网申",
  "网申开启 校园招聘",
  "提前批 校园招聘",
  "补录 校园招聘",
  "管培生 校园招聘",
];

const LLM_SYSTEM_PROMPT = `你是一位校园招聘信息识别助手。你的任务是从搜索结果中识别和提取校园招聘信息。

严格规则：
1. 只采集以下类型：校园招聘、校招、秋招、春招、暑期实习、寒假实习、留用实习、应届生招聘、提前批、补录、管培生
2. 必须过滤以下内容：宣讲会、空宣、双选会、招聘会、社会招聘、社招、有经验岗位、兼职、外包、劳务派遣、普工、猎头岗位、成熟人才招聘
3. 如果内容同时包含校园招聘和宣讲会，只提取校园招聘信息，忽略宣讲会信息
4. 如果主体是宣讲会、空宣、双选会或招聘会，直接过滤，不生成记录
5. 网申链接不能编造，必须是搜索结果中明确提到的URL
6. 优先判断来源类型：企业招聘官网=official，企业官方公众号=official，高校就业网=university，学院就业公众号=university，第三方平台=third_party

请分析以下搜索结果，提取校园招聘信息。输出严格为JSON数组格式，不要包含任何其他文字。

每条记录包含以下字段：
- company_name: 公司名称（必填）
- recruitment_type: 招聘类型，必须是以下之一：校招、秋招、春招、暑期实习、寒假实习、留用实习、管培生、提前批、补录、应届生招聘（必填）
- year: 年份，如"2026"、"2027"（如有）
- cohort: 届别，如"2026届"、"2027届"（如有）
- theme: 招聘主题/标题（如有）
- positions: 岗位信息（如有）
- locations: 工作地点（如有）
- requirements: 任职要求摘要（如有）
- application_url: 网申链接，必须是实际URL，不能编造（如有）
- source_type: 来源类型，official/university/third_party（必填）
- description: 简要描述（如有）

如果不是校园招聘信息，不要输出该条记录。如果所有结果都不是校园招聘，返回空数组 []`;

function parseLLMResponse(content: string): Array<Record<string, unknown>> {
  // 尝试从 markdown 代码块中提取 JSON
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // 尝试直接解析
  try {
    const parsed = JSON.parse(content.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // fall through
  }

  // 尝试提取 JSON 数组
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // fall through
    }
  }

  return [];
}

export async function POST(request: NextRequest) {
  const { forceRefresh } = await request.json().catch(() => ({ forceRefresh: false }));
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const supabase = getSupabaseClient();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // 第一层查重：搜索任务查重（24h 内同一关键词不重复搜索）
        const twentyFourHoursAgo = new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ).toISOString();

        const { data: recentTasks } = await supabase
          .from("campus_search_tasks")
          .select("keyword")
          .gte("searched_at", twentyFourHoursAgo);

        const searchedKeywords = new Set(
          (recentTasks || []).map((t: { keyword: string }) => t.keyword)
        );

        const keywordsToSearch = forceRefresh
          ? SEARCH_KEYWORDS
          : SEARCH_KEYWORDS.filter((k) => !searchedKeywords.has(k));

        if (keywordsToSearch.length === 0) {
          sendEvent("complete", {
            message: "所有关键词已在24小时内搜索过，无需重复搜索",
            totalFound: 0,
            newRecords: 0,
            duplicates: 0,
            skipped: SEARCH_KEYWORDS.length,
          });
          controller.close();
          return;
        }

        sendEvent("start", {
          totalKeywords: keywordsToSearch.length,
          skippedKeywords: SEARCH_KEYWORDS.length - keywordsToSearch.length,
        });

        const searchClient = new SearchClient(new Config(), customHeaders);
        const llmClient = new LLMClient(new Config(), customHeaders);

        let totalFound = 0;
        let newRecords = 0;
        let duplicates = 0;

        // 获取已存在的 source_url 用于链接查重
        const { data: existingUrls } = await supabase
          .from("campus_records")
          .select("source_url")
          .gte("created_at", twentyFourHoursAgo);

        const existingUrlSet = new Set(
          (existingUrls || []).map((r: { source_url: string }) => r.source_url)
        );

        // 获取已存在的记录用于招聘记录查重
        const { data: existingRecords } = await supabase
          .from("campus_records")
          .select("company_name, recruitment_type, year");

        const existingRecordKeys = new Set(
          (existingRecords || []).map(
            (r: { company_name: string; recruitment_type: string; year: string }) =>
              `${r.company_name}|${r.recruitment_type}|${r.year}`
          )
        );

        for (let i = 0; i < keywordsToSearch.length; i++) {
          const keyword = keywordsToSearch[i];

          sendEvent("progress", {
            phase: "searching",
            keyword,
            current: i + 1,
            total: keywordsToSearch.length,
          });

          // 执行搜索
          let searchResults: Array<{
            title?: string;
            url?: string;
            snippet: string;
            site_name?: string;
            content?: string;
          }> = [];

          try {
            const response = await searchClient.advancedSearch(keyword, {
              searchType: "web",
              count: 10,
              timeRange: "1m",
              needContent: false,
              needUrl: true,
              needSummary: false,
            });
            searchResults = (response.web_items || []).map((item) => ({
              title: item.title,
              url: item.url,
              snippet: item.snippet || "",
              site_name: item.site_name,
              content: item.content,
            }));
          } catch (err) {
            sendEvent("warning", {
              keyword,
              message: `搜索失败: ${err instanceof Error ? err.message : "未知错误"}`,
            });
            // 记录搜索任务（即使失败也记录，避免重复搜索）
            await supabase.from("campus_search_tasks").insert({
              keyword,
              results_count: 0,
              new_records_count: 0,
              searched_at: new Date().toISOString(),
            });
            continue;
          }

          totalFound += searchResults.length;

          sendEvent("found", {
            keyword,
            resultsCount: searchResults.length,
          });

          // 第二层查重：链接查重
          const newResults = searchResults.filter(
            (r) => r.url && !existingUrlSet.has(r.url)
          );

          if (newResults.length === 0) {
            // 记录搜索任务
            await supabase.from("campus_search_tasks").insert({
              keyword,
              results_count: searchResults.length,
              new_records_count: 0,
              searched_at: new Date().toISOString(),
            });
            continue;
          }

          // 使用 LLM 分析搜索结果
          sendEvent("progress", {
            phase: "analyzing",
            keyword,
            resultsToAnalyze: newResults.length,
          });

          const searchResultsText = newResults
            .map(
              (r, idx) =>
                `[${idx + 1}] 标题: ${r.title}\n来源: ${r.site_name}\n链接: ${r.url}\n摘要: ${r.snippet}${r.content ? `\n内容: ${r.content.substring(0, 500)}` : ""}`
            )
            .join("\n\n");

          try {
            const llmResponse = await llmClient.invoke(
              [
                { role: "system", content: LLM_SYSTEM_PROMPT },
                {
                  role: "user",
                  content: `请分析以下搜索结果，提取校园招聘信息：\n\n${searchResultsText}`,
                },
              ],
              {
                model: "doubao-seed-2-0-lite-260215",
                temperature: 0.1,
              }
            );

            const extractedRecords = parseLLMResponse(llmResponse.content);

            // 第三层查重：招聘记录查重 + 插入
            const recordsToInsert: Array<Record<string, unknown>> = [];

            for (const record of extractedRecords) {
              const companyName = String(record.company_name || "").trim();
              const recruitmentType = String(
                record.recruitment_type || ""
              ).trim();
              const year = String(record.year || "").trim();

              if (!companyName || !recruitmentType) continue;

              // 记录查重
              const recordKey = `${companyName}|${recruitmentType}|${year}`;
              if (existingRecordKeys.has(recordKey)) {
                duplicates++;
                continue;
              }

              // 找到对应的搜索结果 URL
              const matchingResult = newResults.find(
                (r) =>
                  r.snippet?.includes(companyName) ||
                  r.title?.includes(companyName)
              );

              const sourceUrl = matchingResult?.url || newResults[0]?.url || "";
              const sourceName = matchingResult?.site_name || "";

              if (!sourceUrl) continue;

              // 更新链接查重集合
              existingUrlSet.add(sourceUrl);
              existingRecordKeys.add(recordKey);

              recordsToInsert.push({
                company_name: companyName,
                recruitment_type: recruitmentType,
                year: year || null,
                cohort: String(record.cohort || "").trim() || null,
                theme: String(record.theme || "").trim() || null,
                positions: String(record.positions || "").trim() || null,
                locations: String(record.locations || "").trim() || null,
                requirements: String(record.requirements || "").trim() || null,
                application_url:
                  String(record.application_url || "").trim() || null,
                source_url: sourceUrl,
                source_name: sourceName || null,
                source_type: String(record.source_type || "unknown").trim(),
                description: String(record.description || "").trim() || null,
                status: "active",
                discovered_at: new Date().toISOString(),
              });
            }

            // 批量插入
            if (recordsToInsert.length > 0) {
              const { error: insertError } = await supabase
                .from("campus_records")
                .insert(recordsToInsert);

              if (insertError) {
                sendEvent("warning", {
                  keyword,
                  message: `插入记录失败: ${insertError.message}`,
                });
              } else {
                newRecords += recordsToInsert.length;

                // 发送新记录事件
                for (const record of recordsToInsert) {
                  sendEvent("record", record);
                }
              }
            }

            // 记录搜索任务
            await supabase.from("campus_search_tasks").insert({
              keyword,
              results_count: searchResults.length,
              new_records_count: recordsToInsert.length,
              searched_at: new Date().toISOString(),
            });
          } catch (err) {
            sendEvent("warning", {
              keyword,
              message: `AI分析失败: ${err instanceof Error ? err.message : "未知错误"}`,
            });
            // 记录搜索任务
            await supabase.from("campus_search_tasks").insert({
              keyword,
              results_count: searchResults.length,
              new_records_count: 0,
              searched_at: new Date().toISOString(),
            });
          }
        }

        sendEvent("complete", {
          totalFound,
          newRecords,
          duplicates,
          skipped: SEARCH_KEYWORDS.length - keywordsToSearch.length,
        });

        controller.close();
      } catch (err) {
        sendEvent("error", {
          message: err instanceof Error ? err.message : "未知错误",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
