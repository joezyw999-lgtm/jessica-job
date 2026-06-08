import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/campus/search-tasks - 获取搜索任务历史
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const { data, error } = await supabase
      .from("campus_search_tasks")
      .select("*")
      .order("searched_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`查询失败: ${error.message}`);

    // 获取最近的搜索时间
    const { data: latestTask } = await supabase
      .from("campus_search_tasks")
      .select("searched_at")
      .order("searched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      data: data || [],
      lastSearchTime: latestTask?.searched_at || null,
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
