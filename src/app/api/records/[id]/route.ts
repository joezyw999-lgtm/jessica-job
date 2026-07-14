import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-device-id',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// PATCH /api/records/[id] - 更新面经记录
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    const updateFields: Record<string, string | null> = {};
    if ('company' in body) updateFields.company = body.company;
    if ('position' in body) updateFields.position = body.position;
    if ('industry' in body) updateFields.industry = body.industry;
    if ('category' in body) updateFields.category = body.category;
    if ('experienceType' in body) updateFields.experience_type = body.experienceType;
    if ('experience_type' in body) updateFields.experience_type = body.experience_type;
    if ('country' in body) updateFields.country = body.country;
    if ('content' in body) updateFields.content = body.content;
    if ('originalContent' in body) updateFields.original_content = body.originalContent;
    if ('original_content' in body) updateFields.original_content = body.original_content;
    if ('status' in body) updateFields.status = body.status;

    updateFields.updated_at = new Date().toISOString();

    const { data, error } = await client
      .from('mianjing_records')
      .update(updateFields)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`更新失败: ${error.message}`);

    // 返回 camelCase 格式
    const result = data ? {
      id: data.id,
      imageUrl: data.image_url || "",
      imageUrls: data.image_urls || [],
      imageFileKey: data.image_file_key || "",
      fileName: data.file_name || "",
      company: data.company || "",
      position: data.position || "",
      industry: data.industry || "",
      category: data.category || "国内",
      experienceType: data.experience_type || "面经",
      country: data.country || "大陆",
      content: data.content || "",
      originalContent: data.original_content || "",
      status: data.status || "done",
      deviceId: data.device_id || "",
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    } : null;

    return NextResponse.json({ success: true, data: result }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新记录失败';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

// DELETE /api/records/[id] - 删除面经记录
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { error } = await client
      .from('mianjing_records')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除记录失败';
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
