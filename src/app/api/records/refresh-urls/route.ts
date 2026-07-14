import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// POST /api/records/refresh-urls - 确保图片 URL 正确（Supabase Storage 公开 URL）
export async function POST() {
  try {
    const client = getSupabaseClient();
    const supabaseUrl = process.env.SUPABASE_URL;

    if (!supabaseUrl) {
      throw new Error('请配置 SUPABASE_URL 环境变量');
    }

    const { data: records, error } = await client
      .from('mianjing_records')
      .select('id, image_url')
      .order('created_at', { ascending: true });

    if (error) throw new Error(`查询失败: ${error.message}`);

    // Supabase Storage 图片是公开的，确保 URL 正确
    let updatedCount = 0;

    for (const record of records || []) {
      const updates: { image_url?: string } = {};

      // 如果有 image_file_key 字段且 URL 不是 Supabase 公开地址，更新一下
      if ((record as any).image_file_key && !record.image_url?.includes('supabase')) {
        updates.image_url = `${supabaseUrl}/storage/v1/object/public/images/${(record as any).image_file_key}`;
      }

      if (Object.keys(updates).length > 0) {
        await client
          .from('mianjing_records')
          .update(updates)
          .eq('id', record.id);
        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `已更新 ${updatedCount} 条记录的图片 URL`,
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Refresh URLs error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '刷新失败' },
      { status: 500, headers: corsHeaders }
    );
  }
}
