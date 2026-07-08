import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient, getSupabaseCredentials } from "@/storage/database/supabase-client";

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-device-id',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
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

    // 使用 Supabase Storage 上传文件
    const supabase = getSupabaseClient();
    const { url: supabaseUrl } = getSupabaseCredentials();
    
    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `mianjing/${timestamp}_${safeName}`;

    // 上传到 Supabase Storage 的 'images' bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `上传失败: ${uploadError.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    // 获取公开访问 URL
    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(uploadData.path);

    const imageUrl = urlData.publicUrl;

    return NextResponse.json({
      success: true,
      data: {
        imageUrl,
        fileKey: uploadData.path,
        fileName: file.name,
      },
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "文件上传失败，请重试";
    console.error("Upload API error:", error);
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}