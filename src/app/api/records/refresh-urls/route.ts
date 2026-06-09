import { NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// POST /api/records/refresh-urls - 批量刷新图片预签名URL
export async function POST() {
  try {
    const client = getSupabaseClient();

    const { data: records, error } = await client
      .from('mianjing_records')
      .select('id, image_file_key, image_urls')
      .order('created_at', { ascending: true });

    if (error) throw new Error(`查询失败: ${error.message}`);

    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

    // 收集所有需要刷新的 fileKey
    const urlMap: Record<string, string> = {};

    for (const record of records || []) {
      const fileKeys: string[] = [];

      // 从 image_file_key 取
      if (record.image_file_key) {
        fileKeys.push(record.image_file_key);
      }

      // 从 image_urls 解析已有的 fileKey（旧数据可能只有 URL 没有 fileKey）
      // 提取 URL 中的路径部分作为 key
      if (record.image_urls) {
        try {
          const urls: string[] = JSON.parse(record.image_urls);
          for (const url of urls) {
            // 从预签名 URL 中提取 fileKey
            try {
              const urlObj = new URL(url);
              const pathParts = urlObj.pathname.split('/').filter(Boolean);
              // 去掉 bucket 名部分，剩下的就是 fileKey
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
      if (fileKeys.length > 0) {
        const newUrls: string[] = [];
        for (const key of fileKeys) {
          try {
            const newUrl = await storage.generatePresignedUrl({
              key,
              expireTime: 86400, // 24小时有效
            });
            newUrls.push(newUrl);
          } catch {
            // 生成失败，跳过
          }
        }
        if (newUrls.length > 0) {
          urlMap[record.id] = newUrls[0];
        }

        // 更新数据库中的 URL
        if (newUrls.length > 0) {
          await client
            .from('mianjing_records')
            .update({
              image_url: newUrls[0],
              image_urls: JSON.stringify(newUrls),
            })
            .eq('id', record.id);
        }
      }
    }

    return NextResponse.json({ success: true, data: urlMap });
  } catch (err) {
    const message = err instanceof Error ? err.message : '刷新URL失败';
    console.error('Refresh URLs error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
