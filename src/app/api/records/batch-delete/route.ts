import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-device-id',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// POST /api/records/batch-delete - 批量删除面经记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] | undefined };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: '请提供要删除的记录 ID 列表' },
        { status: 400, headers: corsHeaders }
      );
    }

    const deviceId = request.headers.get('x-device-id');
    const client = getSupabaseClient();

    let query = client
      .from('mianjing_records')
      .delete()
      .in('id', ids);

    // 按设备隔离，防止跨设备删除
    if (deviceId) {
      query = query.eq('device_id', deviceId);
    }

    const { error } = await query;

    if (error) {
      throw new Error(`删除失败: ${error.message}`);
    }

    return NextResponse.json(
      { success: true, deletedCount: ids.length },
      { headers: corsHeaders }
    );

  } catch (error: unknown) {
    console.error('Batch delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '批量删除失败' },
      { status: 500, headers: corsHeaders }
    );
  }
}
