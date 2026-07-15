import { NextResponse } from "next/server";
import { getSupabaseClient as getSupabase } from "@/storage/database/supabase-client";
import { safeParseImageUrls, formatContent } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || searchParams.get("page_size") || "20", 10);
    const deviceId =
      searchParams.get("device_id") ||
      searchParams.get("deviceId") ||
      request.headers.get("x-device-id") ||
      undefined;
    const keyword = searchParams.get("keyword") || undefined;
    const company = searchParams.get("company") || undefined;
    const position = searchParams.get("position") || undefined;
    const industry = searchParams.get("industry") || undefined;
    const category = searchParams.get("category") || undefined;
    const experienceType = searchParams.get("experienceType") || searchParams.get("experience_type") || undefined;
    const country = searchParams.get("country") || undefined;

    const supabase = getSupabase();

    let query = supabase
      .from("mianjing_records")
      .select("*", { count: "exact" });

    // 设备过滤
    if (deviceId) {
      query = query.eq("device_id", deviceId);
    }

    // 关键词搜索（公司、岗位、内容模糊匹配）
    if (keyword) {
      query = query.or(
        `company.ilike.%${keyword}%,position.ilike.%${keyword}%,content.ilike.%${keyword}%`
      );
    }

    // 精准筛选
    if (company) query = query.eq("company", company);
    if (position) query = query.eq("position", position);
    if (industry) query = query.eq("industry", industry);
    if (category) query = query.eq("category", category);
    if (experienceType) query = query.eq("experience_type", experienceType);
    if (country) query = query.eq("country", country);

    // 排序 + 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const records = (data || []).map((record: any) => ({
      id: record.id,
      company: record.company || "",
      position: record.position || "",
      industry: record.industry || "",
      content: record.content || "",
      originalContent: record.original_content || "",
      imageUrl: record.image_url || "",
      imageUrls: safeParseImageUrls(record.image_urls),
      imageFileKey: record.image_file_key || "",
      fileName: record.file_name || "",
      status: record.status || "pending",
      errorMsg: record.error_msg || "",
      category: record.category || "国内",
      experienceType: record.experience_type || "面经",
      country: record.country || "大陆",
      deviceId: record.device_id || "",
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    }));

    return NextResponse.json({
      success: true,
      data: records,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        hasMore: count ? page * pageSize < count : false,
      },
    });
  } catch (error: any) {
    console.error("获取记录失败:", error);
    return NextResponse.json(
      { success: false, error: error.message || "获取记录失败" },
      { status: 500 }
    );
  }
}

// 新增记录 - 增加去重逻辑：同设备 + 同公司 + 同岗位 + 同内容前50字
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const headerDeviceId = request.headers.get("x-device-id");
    const {
      image_url,
      image_urls,
      image_file_key,
      file_name,
      company,
      position,
      industry,
      content,
      original_content,
      status,
      category,
      experience_type,
      country,
      device_id,
    } = body;

    // 兼容 camelCase 参数
    const deviceId =
      body.device_id ||
      body.deviceId ||
      headerDeviceId ||
      "";

    // 安全的字符串转换（避免 .substring is not a function）
    function toText(value: unknown): string {
      if (value === null || value === undefined) return "";
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.join("\n");
      return JSON.stringify(value);
    }

    const safeCompany = toText(company);
    const safePosition = toText(position);
    const safeIndustry = toText(industry);
    // 文本字段安全转换 + 结构化内容格式化为纯文本（防止 AI 返回对象/数组）
    const safeContent = formatContent(content);
    const safeOriginalContent = formatContent(original_content);
    const safeFileName = toText(file_name);
    const safeCategory = toText(category) || "国内";
    const safeExperienceType = toText(experience_type) || toText(body.experienceType) || "面经";
    const safeCountry = toText(country) || "大陆";
    const safeStatus = toText(status) || "pending";

    const supabase = getSupabase();

    // 去重检查：同设备 + 同公司 + 同岗位 + 内容前50字相同
    if (deviceId && safeCompany && safePosition && safeContent) {
      const contentPrefix = safeContent.substring(0, 50);
      const { data: existing } = await supabase
        .from("mianjing_records")
        .select("id")
        .eq("device_id", deviceId)
        .eq("company", safeCompany)
        .eq("position", safePosition)
        .limit(10)
        .order("created_at", { ascending: false });

      if (existing && existing.length > 0) {
        // 进一步检查内容前缀
        const { data: dupCheck } = await supabase
          .from("mianjing_records")
          .select("id, content")
          .in(
            "id",
            existing.map((r: any) => r.id)
          );

        const isDuplicate = dupCheck?.some((r: any) =>
          (r.content || "").startsWith(contentPrefix)
        );

        if (isDuplicate) {
          return NextResponse.json({
            success: true,
            data: { id: dupCheck![0].id },
            duplicated: true,
            message: "记录已存在，跳过重复插入",
          });
        }
      }
    }

    // image_file_key 只存第一张图的 key（多图 key 不拼接，全部 URL 存在 image_urls）
    let normalizedImageFileKey = image_file_key;
    if (Array.isArray(image_file_key)) {
      normalizedImageFileKey = image_file_key[0] || "";
    } else if (typeof image_file_key === "string" && image_file_key.includes(",")) {
      normalizedImageFileKey = image_file_key.split(",")[0];
    }

    const insertData: any = {
      image_url,
      image_urls: JSON.stringify(image_urls || []),
      image_file_key: normalizedImageFileKey,
      file_name: safeFileName,
      company: safeCompany,
      position: safePosition,
      industry: safeIndustry,
      content: safeContent,
      original_content: safeOriginalContent,
      status: safeStatus,
      category: safeCategory,
      experience_type: safeExperienceType,
      country: safeCountry,
      device_id: deviceId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("mianjing_records")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        company: data.company,
        position: data.position,
        industry: data.industry,
        content: data.content,
        originalContent: data.original_content,
        imageUrl: data.image_url,
        imageUrls: data.image_urls,
        imageFileKey: data.image_file_key,
        fileName: data.file_name,
        status: data.status,
        category: data.category,
        experienceType: data.experience_type,
        country: data.country,
        deviceId: data.device_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (error: any) {
    console.error("插入记录失败:", error);
    return NextResponse.json(
      { success: false, error: `插入失败: ${error.message}` },
      { status: 500 }
    );
  }
}
