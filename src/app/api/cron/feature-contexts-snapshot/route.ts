import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// 機能別デフォルト背景情報のスナップショット日次更新
// context_save_id が生きているものは現在値で snapshot を上書き
export async function POST(req: NextRequest) {
  // Vercel Cron Secret 検証
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    const result = await sql`
      UPDATE feature_default_contexts fdc
      SET
        topic_snapshot = cs.topic,
        context_text_snapshot = cs.context_text,
        snapshot_at = NOW(),
        updated_at = NOW()
      FROM context_saves cs
      WHERE fdc.context_save_id = cs.id
        AND fdc.user_id = cs.user_id
        AND (
          fdc.topic_snapshot <> cs.topic
          OR fdc.context_text_snapshot <> cs.context_text
        )
      RETURNING fdc.id
    `;

    return NextResponse.json({ success: true, updated: result.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'スナップショット更新に失敗しました' }, { status: 500 });
  }
}

// 手動更新用（管理画面・デバッグから叩く）
export async function GET(req: NextRequest) {
  return POST(req);
}
