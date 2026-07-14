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
 * 使用 Supabase Storage 上传图片
 */
async function uploadToSupabase(file: File): Promise<{ imageUrl: string; fileKey: string }> {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('请配置 SUPABASE_URL 和 SUPABASE_ANON_KEY（或 SUPABASE_SERVICE_ROLE_KEY）环境变量');
  }

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

    const uploadResult = await uploadToSupabase(file);

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
