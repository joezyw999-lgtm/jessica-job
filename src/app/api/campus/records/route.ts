import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/campus/records - 获取校招记录列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const recruitmentType = searchParams.get("recruitment_type");
    const year = searchParams.get("year");
    const sourceType = searchParams.get("source_type");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("page_size") || "50", 10);
    const keyword = searchParams.get("keyword");

    let query = supabase
      .from("campus_records")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status) query = query.eq("status", status);
    if (recruitmentType) query = query.eq("recruitment_type", recruitmentType);
    if (year) query = query.eq("year", year);
    if (sourceType) query = query.eq("source_type", sourceType);
    if (keyword) {
      query = query.or(
        `company_name.ilike.%${keyword}%,theme.ilike.%${keyword}%,positions.ilike.%${keyword}%`
      );
    }

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
      year,
      cohort,
      theme,
      positions,
      locations,
      requirements,
      application_url,
      source_url,
      source_name,
      source_type,
      description,
    } = body;

    if (!company_name || !recruitment_type || !source_url) {
      return NextResponse.json(
        { success: false, error: "公司名称、招聘类型和来源链接为必填项" },
        { status: 400 }
      );
    }

    // 查重：同公司 + 同类型 + 同年份
    const { data: existing } = await supabase
      .from("campus_records")
      .select("id")
      .eq("company_name", company_name)
      .eq("recruitment_type", recruitment_type);

    const duplicateRecords = (existing || []).filter(
      (r: { id: string }) => {
        if (!year) return true;
        return true;
      }
    );

    // 简化查重：如果同公司+同类型已有记录，检查年份
    if (existing && existing.length > 0) {
      if (year) {
        const { data: yearMatch } = await supabase
          .from("campus_records")
          .select("id")
          .eq("company_name", company_name)
          .eq("recruitment_type", recruitment_type)
          .eq("year", year);

        if (yearMatch && yearMatch.length > 0) {
          return NextResponse.json({
            success: false,
            error: "该记录已存在（同公司、同类型、同年份）",
          });
        }
      }
    }

    const { data, error } = await supabase
      .from("campus_records")
      .insert({
        company_name,
        recruitment_type,
        year: year || null,
        cohort: cohort || null,
        theme: theme || null,
        positions: positions || null,
        locations: locations || null,
        requirements: requirements || null,
        application_url: application_url || null,
        source_url,
        source_name: source_name || null,
        source_type: source_type || "unknown",
        description: description || null,
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
