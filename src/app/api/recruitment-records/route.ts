import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const supabase = getSupabaseClient();

// GET /api/recruitment-records?deviceId=xxx
export async function GET(request: NextRequest) {
  try {
    const deviceId = request.nextUrl.searchParams.get("deviceId");
    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "缺少 deviceId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("recruitment_records")
      .select("*")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Parse JSON fields
    const records = (data || []).map((r: Record<string, unknown>) => ({
      ...r,
      locations: r.locations ? JSON.parse(r.locations as string) : [],
      positions: r.positions ? JSON.parse(r.positions as string) : [],
      field_sources: r.field_sources
        ? JSON.parse(r.field_sources as string)
        : {},
      warnings: r.warnings ? JSON.parse(r.warnings as string) : [],
    }));

    return NextResponse.json({ success: true, data: records });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "获取记录失败";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST /api/recruitment-records
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, ...fields } = body;

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "缺少 deviceId" },
        { status: 400 }
      );
    }

    const record = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      device_id: deviceId,
      ...fields,
      locations: JSON.stringify(fields.locations || []),
      positions: JSON.stringify(fields.positions || []),
      field_sources: JSON.stringify(fields.fieldSources || {}),
      warnings: JSON.stringify(fields.warnings || []),
    };

    const { data, error } = await supabase
      .from("recruitment_records")
      .insert(record)
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
      error instanceof Error ? error.message : "创建记录失败";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
