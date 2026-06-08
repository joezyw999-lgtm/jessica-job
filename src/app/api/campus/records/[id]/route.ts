import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// PATCH /api/campus/records/[id] - 更新校招记录
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();
    const body = await request.json();

    const allowedFields = [
      "company_name",
      "recruitment_type",
      "source_url",
      "source_name",
      "source_type",
      "status",
    ];

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from("campus_records")
      .update(updateData)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`更新失败: ${error.message}`);

    if (!data) {
      return NextResponse.json(
        { success: false, error: "记录不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "更新失败",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/campus/records/[id] - 删除校招记录
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("campus_records")
      .delete()
      .eq("id", id);

    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "删除失败",
      },
      { status: 500 }
    );
  }
}
