import { NextRequest, NextResponse } from "next/server";

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-device-id',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * 检测当前环境
 */
function getEnvironment(): 'coze' | 'supabase' {
  // Coze 环境有 COZE_BUCKET 相关变量
  const hasCozeBucket = process.env.COZE_BUCKET_NAME && process.env.COZE_BUCKET_ENDPOINT_URL;
  // 自定义 Supabase 环境有 SUPABASE_URL
  const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY;
  
  if (hasCozeBucket) {
    return 'coze';
  }
  
  if (hasSupabase) {
    return 'supabase';
  }
  
  // 默认使用 Coze bucket（如果有）
  if (process.env.COZE_BUCKET_NAME) {
    return 'coze';
  }
  
  return 'supabase';
}

/**
 * 使用 Coze S3 上传（通过 Coze SDK）
 */
async function uploadToCozeS3(file: File): Promise<{ imageUrl: string; fileKey: string }> {
  const { S3Storage } = await import('coze-coding-dev-sdk');
  
  // 使用 Coze SDK 的 S3Storage，自动处理认证
  const storage = new S3Storage();
  
  const buffer = Buffer.from(await file.arrayBuffer());
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `mianjing/${timestamp}_${safeName}`;
  
  // 上传文件
  const fileKey = await storage.uploadFile({
    fileContent: buffer,
    fileName: fileName,
    contentType: file.type,
  });
  
  // 生成预签名 URL（有效期 24 小时）
  const imageUrl = await storage.generatePresignedUrl({
    key: fileKey,
    expireTime: 86400, // 24 小时
  });
  
  return { imageUrl, fileKey };
}

/**
 * 使用 Supabase Storage 上传
 */
async function uploadToSupabase(file: File): Promise<{ imageUrl: string; fileKey: string }> {
  const { createClient } = await import('@supabase/supabase-js');
  
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const buffer = Buffer.from(await file.arrayBuffer());
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `mianjing/${timestamp}_${safeName}`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('images')
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });
  
  if (uploadError) {
    throw new Error(uploadError.message);
  }
  
  const { data: urlData } = supabase.storage
    .from('images')
    .getPublicUrl(uploadData.path);
  
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    throw new Error('无法生成图片访问地址，请检查 Storage bucket 是否设置为 Public');
  }
  
  return { imageUrl: publicUrl, fileKey: uploadData.path };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "缺少文件" }, { status: 400, headers: corsHeaders });
    }

    // 校验文件类型
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "仅支持 JPG/PNG/GIF/WebP/BMP 格式的图片" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 校验文件大小（最大 10MB）
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "图片大小不能超过 10MB" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 根据环境选择上传方式
    const env = getEnvironment();
    let uploadResult: { imageUrl: string; fileKey: string };
    
    if (env === 'coze') {
      uploadResult = await uploadToCozeS3(file);
    } else {
      uploadResult = await uploadToSupabase(file);
    }

    return NextResponse.json({
      success: true,
      data: {
        imageUrl: uploadResult.imageUrl,
        fileKey: uploadResult.fileKey,
        fileName: file.name,
      },
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "上传失败";
    console.error("Upload error:", error);
    return NextResponse.json({ error: `上传失败: ${message}` }, { status: 500, headers: corsHeaders });
  }
}