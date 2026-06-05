import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/records - 获取指定设备的面经记录
export async function GET(request: NextRequest) {
  try {
    const deviceId = request.headers.get('x-device-id');
    const client = getSupabaseClient();

    let query = client
      .from('mianjing_records')
      .select('*')
      .order('created_at', { ascending: true });

    if (deviceId) {
      query = query.eq('device_id', deviceId);
    }

    const { data, error } = await query;

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
      device_id: body.device_id ?? null,
      image_url: body.image_url ?? '',
      image_file_key: body.image_file_key ?? null,
      company: body.company ?? null,
      position: body.position ?? null,
      industry: body.industry ?? null,
      category: body.category ?? '国内',
      experience_type: body.experience_type ?? '面经',
      country: body.country ?? '大陆',
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
