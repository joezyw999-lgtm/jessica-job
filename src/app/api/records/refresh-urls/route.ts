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

/**
 * 检测当前环境
 */
function getEnvironment(): 'coze' | 'supabase' {
  const hasCozeBucket = process.env.COZE_BUCKET_NAME && process.env.COZE_BUCKET_ENDPOINT_URL;
  const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY;
  
  if (hasCozeBucket) {
    return 'coze';
  }
  
  return 'supabase';
}

// POST /api/records/refresh-urls - 批量刷新图片预签名URL
export async function POST() {
  try {
    const env = getEnvironment();
    const client = getSupabaseClient();

    const { data: records, error } = await client
      .from('mianjing_records')
      .select('id, image_file_key, image_urls, image_url')
      .order('created_at', { ascending: true });

    if (error) throw new Error(`查询失败: ${error.message}`);

    if (env === 'coze') {
      // Coze 环境：使用 Coze S3Storage
      const { S3Storage } = await import('coze-coding-dev-sdk');
      
      const storage = new S3Storage({
        endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
        accessKey: '',
        secretKey: '',
        bucketName: process.env.COZE_BUCKET_NAME,
        region: 'cn-beijing',
      });

      const urlMap: Record<string, string> = {};

      for (const record of records || []) {
        const fileKeys: string[] = [];

        if (record.image_file_key) {
          fileKeys.push(record.image_file_key);
        }

        if (record.image_urls) {
          try {
            const urls: string[] = JSON.parse(record.image_urls);
            for (const url of urls) {
              try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/').filter(Boolean);
                if (pathParts.length > 1) {
                  const key = pathParts.slice(1).join('/');
                  if (!fileKeys.includes(key)) {
                    fileKeys.push(key);
                  }
                }
              } catch {
                // URL 解析失败，跳过
              }
            }
          } catch {
            // JSON 解析失败，跳过
          }
        }

        // 为每个 fileKey 生成新的预签名 URL
        for (const key of fileKeys) {
          if (!urlMap[key]) {
            try {
              const newUrl = await storage.generatePresignedUrl({
                key: key,
                expireTime: 86400,
              });
              urlMap[key] = newUrl;
            } catch {
              // 生成失败，跳过
            }
          }
        }
      }

      // 更新数据库中的 URL
      let updatedCount = 0;
      for (const record of records || []) {
        const updates: { image_url?: string; image_urls?: string } = {};

        if (record.image_file_key && urlMap[record.image_file_key]) {
          updates.image_url = urlMap[record.image_file_key];
        }

        if (record.image_urls) {
          try {
            const urls: string[] = JSON.parse(record.image_urls);
            const newUrls = urls.map(url => {
              try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/').filter(Boolean);
                if (pathParts.length > 1) {
                  const key = pathParts.slice(1).join('/');
                  if (urlMap[key]) {
                    return urlMap[key];
                  }
                }
              } catch {
                // 忽略
              }
              return url;
            });
            updates.image_urls = JSON.stringify(newUrls);
          } catch {
            // 忽略
          }
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
        message: `已刷新 ${updatedCount} 条记录的 URL`,
        urlCount: Object.keys(urlMap).length 
      }, { headers: corsHeaders });

    } else {
      // Supabase 环境：图片是公开的，不需要刷新预签名 URL
      // 只需确保 image_url 字段正确
      let updatedCount = 0;
      const supabaseUrl = process.env.SUPABASE_URL!;
      
      for (const record of records || []) {
        const updates: { image_url?: string } = {};
        
        // 如果有 image_file_key，生成 Supabase 公开 URL
        if (record.image_file_key && !record.image_url?.includes('supabase')) {
          updates.image_url = `${supabaseUrl}/storage/v1/object/public/images/${record.image_file_key}`;
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
        message: `已更新 ${updatedCount} 条记录`,
        environment: 'supabase'
      }, { headers: corsHeaders });
    }

  } catch (error) {
    console.error('Refresh URLs error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '刷新失败' },
      { status: 500, headers: corsHeaders }
    );
  }
}
