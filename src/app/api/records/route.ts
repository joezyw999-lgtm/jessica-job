import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// CORS 响应头，允许扩展插件跨域访问
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-device-id',
};

// OPTIONS 预检请求
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET /api/records - 获取所有面经记录
export async function GET() {
  try {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('mianjing_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询记录失败';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
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
      image_urls: body.image_urls ?? null,
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
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('mianjing_records')
      .insert(record)
      .select()
      .single();

    if (error) throw new Error(`插入失败: ${error.message}`);

    return NextResponse.json({ success: true, data }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : '新增记录失败';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
