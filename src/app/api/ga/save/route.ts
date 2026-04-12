import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

// AI分析結果を既存スナップショットに保存
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const { snapshotId, aiInsight } = await req.json();

    if (!snapshotId) {
      return NextResponse.json({ error: 'snapshotId が必要です' }, { status: 400 });
    }
    if (!aiInsight) {
      return NextResponse.json({ error: 'aiInsight が必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    const rows = await sql`
      UPDATE ga_snapshots
      SET ai_insight = ${JSON.stringify(aiInsight)}::jsonb,
          saved_at = NOW()
      WHERE id = ${snapshotId}
      RETURNING id, saved_at
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: '該当するスナップショットが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: rows[0].id, savedAt: rows[0].saved_at });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[ga/save] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 保存済みスナップショット一覧を取得（最新20件）
export async function GET() {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as Record<string, unknown>).id as string;

  try {
    const sql = neon(process.env.DATABASE_URL!);

    const rows = await sql`
      SELECT
        s.id,
        s.date_start,
        s.date_end,
        s.sessions,
        s.users,
        s.new_users,
        s.pageviews,
        s.bounce_rate,
        s.engagement_rate,
        s.avg_session_duration,
        s.conversions,
        s.conversion_rate,
        s.channel_breakdown,
        s.top_pages,
        s.ai_insight,
        s.saved_at
      FROM ga_snapshots s
      JOIN ga_properties p ON s.property_id = p.id
      WHERE p.user_id = ${userId}
        AND s.saved_at IS NOT NULL
      ORDER BY s.saved_at DESC
      LIMIT 20
    `;

    return NextResponse.json({ snapshots: rows });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[ga/save] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
