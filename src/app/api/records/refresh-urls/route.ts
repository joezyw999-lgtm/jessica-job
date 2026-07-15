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
      .select('id, image_url, image_file_key, image_urls')
      .order('created_at', { ascending: true });

    if (error) throw new Error(`查询失败: ${error.message}`);

    // Supabase Storage 图片是公开的，确保 URL 正确
    let updatedCount = 0;

    for (const record of records || []) {
      const updates: Record<string, string> = {};
      // 规范化 image_file_key：如果是逗号分隔的多个 key，只保留第一个
      let fileKey = (record as any).image_file_key || '';
      if (typeof fileKey === 'string' && fileKey.includes(',')) {
        fileKey = fileKey.split(',')[0];
      }

      // 规范化 image_url
      const expectedUrl = fileKey ? `${supabaseUrl}/storage/v1/object/public/images/${fileKey}` : null;
      if (expectedUrl && record.image_url !== expectedUrl) {
        updates.image_url = expectedUrl;
      }

      // 规范化 image_urls（如果存的是字符串数组 JSON，确保每张图的 URL 都是 Supabase 公开地址）
      let urls: string[] = [];
      try {
        const raw = (record as any).image_urls;
        if (raw) {
          urls = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!Array.isArray(urls)) urls = [];
        }
      } catch {
        urls = [];
      }

      if (urls.length > 0) {
        // 如果 URL 不是以 supabaseUrl 开头，且 image_file_key 有值，则用 image_file_key 作为第一张的正确 URL
        // 其余 URL 若不是 supabase 域名则保留原样（可能是外部链接）
        let urlsChanged = false;
        const newUrls = urls.map((u, idx) => {
          if (!u?.includes('supabase') && idx === 0 && expectedUrl) {
            urlsChanged = true;
            return expectedUrl;
          }
          return u;
        });
        if (urlsChanged) {
          updates.image_urls = JSON.stringify(newUrls);
        }
      }

      // 如果 fileKey 被规范化了（逗号拼接→单个），也更新回去
      if (fileKey !== (record as any).image_file_key) {
        updates.image_file_key = fileKey;
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
