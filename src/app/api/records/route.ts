import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/records - 获取所有面经记录
export async function GET() {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('mianjing_records')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询记录失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/records - 新增面经记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const client = getSupabaseClient();

    const record = {
      image_url: body.image_url ?? '',
      image_file_key: body.image_file_key ?? null,
      company: body.company ?? null,
      position: body.position ?? null,
      industry: body.industry ?? null,
      original_content: body.original_content ?? null,
      content: body.content ?? null,
      status: body.status ?? 'pending',
    };

    const { data, error } = await client
      .from('mianjing_records')
      .insert(record)
      .select()
      .single();

    if (error) throw new Error(`插入失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '新增记录失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
