import { NextRequest } from "next/server";
import { SearchClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { LLMClient } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";

interface SearchRequestBody {
  forceRefresh?: boolean;
  keywords?: string[];
  filterWords?: string[];
}

function buildLLMSystemPrompt(filterWords: string[]): string {
  const filterSection =
    filterWords.length > 0
      ? `2. 必须过滤以下内容：${filterWords.join("、")}`
      : `2. 必须过滤以下内容：宣讲会、空宣、双选会、招聘会、社会招聘、社招、有经验岗位、兼职、外包、劳务派遣、普工、猎头岗位、成熟人才招聘`;

  return `你是一位校园招聘信息识别助手。你的任务是从搜索结果中识别和提取校园招聘信息。

严格规则：
1. 只采集以下类型：校园招聘、校招、秋招、春招、暑期实习、寒假实习、留用实习、应届生招聘、提前批、补录、管培生
${filterSection}
3. 如果内容同时包含校园招聘和宣讲会，只提取校园招聘信息，忽略宣讲会信息
4. 如果主体是宣讲会、空宣、双选会或招聘会，直接过滤，不生成记录
5. 网申链接不能编造，必须是搜索结果中明确提到的URL
6. 优先判断来源类型：企业招聘官网=official，企业官方公众号=official，高校就业网=university，学院就业公众号=university，第三方平台=third_party

请分析以下搜索结果，提取校园招聘信息。输出严格为JSON数组格式，不要包含任何其他文字。

每条记录包含以下字段：
- company_name: 公司名称或招聘标题（必填）
- recruitment_type: 招聘类型，必须是以下之一：校招、秋招、春招、暑期实习、寒假实习、留用实习、管培生、提前批、补录、应届生招聘（必填）
- source_url: 来源链接（必填，从搜索结果中获取）
- source_type: 来源类型，official/university/third_party（必填）

如果不是校园招聘信息，不要输出该条记录。如果所有结果都不是校园招聘，返回空数组 []`;
}

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
  const body: SearchRequestBody = await request.json().catch(() => ({
    forceRefresh: false,
  }));
  const { forceRefresh = false, keywords = [], filterWords = [] } = body;
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const supabase = getSupabaseClient();

  const LLM_SYSTEM_PROMPT = buildLLMSystemPrompt(filterWords);

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
          ? keywords
          : keywords.filter((k) => !searchedKeywords.has(k));

        if (keywordsToSearch.length === 0) {
          sendEvent("complete", {
            message: "所有关键词已在24小时内搜索过，无需重复搜索",
            totalFound: 0,
            newRecords: 0,
            duplicates: 0,
            skipped: keywords.length,
          });
          controller.close();
          return;
        }

        sendEvent("start", {
          totalKeywords: keywordsToSearch.length,
          skippedKeywords: keywords.length - keywordsToSearch.length,
        });

        const searchClient = new SearchClient(new Config(), customHeaders);
        const llmClient = new LLMClient(new Config(), customHeaders);

        let totalFound = 0;
        let newRecords = 0;
        let duplicates = 0;

        // 获取已存在的记录用于查重
        const { data: existingRecords } = await supabase
          .from("campus_records")
          .select("company_name, recruitment_type, source_url");

        const existingUrlSet = new Set(
          (existingRecords || []).map(
            (r: { source_url: string }) => r.source_url
          )
        );
        const existingRecordKeys = new Set(
          (existingRecords || []).map(
            (r: { company_name: string; recruitment_type: string }) =>
              `${r.company_name}|${r.recruitment_type}`
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

              if (!companyName || !recruitmentType) continue;

              // 记录查重：同公司 + 同类型 = 重复
              const recordKey = `${companyName}|${recruitmentType}`;
              if (existingRecordKeys.has(recordKey)) {
                duplicates++;
                continue;
              }

              // 使用 LLM 返回的 source_url 或从搜索结果中匹配
              let sourceUrl = String(record.source_url || "").trim();
              if (!sourceUrl) {
                const matchingResult = newResults.find(
                  (r) =>
                    r.snippet?.includes(companyName) ||
                    r.title?.includes(companyName)
                );
                sourceUrl = matchingResult?.url || newResults[0]?.url || "";
              }

              if (!sourceUrl) continue;

              // 更新查重集合
              existingUrlSet.add(sourceUrl);
              existingRecordKeys.add(recordKey);

              const sourceName =
                newResults.find((r) => r.url === sourceUrl)?.site_name || "";

              recordsToInsert.push({
                company_name: companyName,
                recruitment_type: recruitmentType,
                source_url: sourceUrl,
                source_name: sourceName || null,
                source_type: String(record.source_type || "unknown").trim(),
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
          skipped: keywords.length - keywordsToSearch.length,
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
