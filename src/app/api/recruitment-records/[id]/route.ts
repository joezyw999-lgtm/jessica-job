import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const supabase = getSupabaseClient();

// PATCH /api/recruitment-records/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Build update object with only provided fields
    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const allowedFields = [
      "company_name",
      "company_type",
      "recruitment_type",
      "industry",
      "theme",
      "deadline",
      "target_candidates",
      "referral",
      "requirements",
      "application_url",
      "confidence",
      "confirmed",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field];
      }
    }

    // Handle JSON array fields
    if (body.locations !== undefined) {
      updateFields.locations = JSON.stringify(body.locations);
    }
    if (body.positions !== undefined) {
      updateFields.positions = JSON.stringify(body.positions);
    }
    if (body.fieldSources !== undefined) {
      updateFields.field_sources = JSON.stringify(body.fieldSources);
    }
    if (body.warnings !== undefined) {
      updateFields.warnings = JSON.stringify(body.warnings);
    }

    const { data, error } = await supabase
      .from("recruitment_records")
      .update(updateFields)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "更新记录失败";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE /api/recruitment-records/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { error } = await supabase
      .from("recruitment_records")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "删除记录失败";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
