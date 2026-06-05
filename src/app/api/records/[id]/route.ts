import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// PATCH /api/records/[id] - 更新面经记录
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const deviceId = request.headers.get('x-device-id');
    const client = getSupabaseClient();

    const updateFields: Record<string, string | null> = {};
    if ('company' in body) updateFields.company = body.company;
    if ('position' in body) updateFields.position = body.position;
    if ('industry' in body) updateFields.industry = body.industry;
    if ('content' in body) updateFields.content = body.content;
    if ('original_content' in body) updateFields.original_content = body.original_content;
    if ('status' in body) updateFields.status = body.status;

    updateFields.updated_at = new Date().toISOString();

    let query = client
      .from('mianjing_records')
      .update(updateFields)
      .eq('id', id);

    // 如果有 device_id，确保只能更新自己的记录
    if (deviceId) {
      query = query.eq('device_id', deviceId);
    }

    const { data, error } = await query.select().maybeSingle();

    if (error) throw new Error(`更新失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新记录失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/records/[id] - 删除面经记录
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deviceId = request.headers.get('x-device-id');
    const client = getSupabaseClient();

    let query = client
      .from('mianjing_records')
      .delete()
      .eq('id', id);

    // 如果有 device_id，确保只能删除自己的记录
    if (deviceId) {
      query = query.eq('device_id', deviceId);
    }

    const { error } = await query;

    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除记录失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
