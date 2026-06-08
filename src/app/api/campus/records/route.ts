import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/campus/records - 获取校招记录列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const recruitmentType = searchParams.get("recruitment_type");
    const sourceType = searchParams.get("source_type");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("page_size") || "50", 10);
    const keyword = searchParams.get("keyword");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    let query = supabase
      .from("campus_records")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status) query = query.eq("status", status);
    if (recruitmentType) query = query.eq("recruitment_type", recruitmentType);
    if (sourceType) query = query.eq("source_type", sourceType);
    if (keyword) {
      query = query.ilike("company_name", `%${keyword}%`);
    }
    if (startDate) query = query.gte("discovered_at", startDate);
    if (endDate) query = query.lte("discovered_at", endDate);

    const { data, error, count } = await query;

    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "查询失败",
      },
      { status: 500 }
    );
  }
}

// POST /api/campus/records - 新增校招记录
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();

    const {
      company_name,
      recruitment_type,
      source_url,
      source_name,
      source_type,
    } = body;

    if (!company_name || !recruitment_type || !source_url) {
      return NextResponse.json(
        { success: false, error: "公司名称、招聘类型和来源链接为必填项" },
        { status: 400 }
      );
    }

    // 查重：同公司 + 同类型
    const { data: existing } = await supabase
      .from("campus_records")
      .select("id")
      .eq("company_name", company_name)
      .eq("recruitment_type", recruitment_type);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: false,
        error: "该记录已存在（同公司、同类型）",
      });
    }

    const { data, error } = await supabase
      .from("campus_records")
      .insert({
        company_name,
        recruitment_type,
        source_url,
        source_name: source_name || null,
        source_type: source_type || "unknown",
        status: "active",
        discovered_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (error) throw new Error(`插入失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "创建失败",
      },
      { status: 500 }
    );
  }
}
