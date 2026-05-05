import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// バッチリサーチジョブの一覧取得・新規登録API

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

  const jobs = await sql`
    SELECT * FROM batch_research_jobs
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { groupName, topics, scheduleType, scheduledAt, notifyEmail } = await req.json();

    if (!Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json({ error: 'topicsが必要です' }, { status: 400 });
    }
    if (topics.length > 10) {
      return NextResponse.json({ error: 'トピックは最大10件までです' }, { status: 400 });
    }

    // モード値を既存システムに揃える（light → quick）
    const normalizeMode = (m: string) => {
      if (m === 'light') return 'quick';
      if (m === 'quick' || m === 'standard' || m === 'deep') return m;
      return 'standard';
    };

    const topicsWithStatus = topics
      .filter((t: any) => t && typeof t.topic === 'string' && t.topic.trim())
      .map((t: any) => ({
        topic: String(t.topic).trim(),
        mode: normalizeMode(String(t.mode || 'standard')),
        status: 'pending',
        result: null,
        contextText: null,
      }));

    if (topicsWithStatus.length === 0) {
      return NextResponse.json({ error: '有効なトピックがありません' }, { status: 400 });
    }

    const validScheduleTypes = ['immediate', 'browser', 'cron'];
    const finalScheduleType = validScheduleTypes.includes(scheduleType) ? scheduleType : 'immediate';

    const finalGroupName = groupName?.trim() || `バッチリサーチ ${new Date().toLocaleString('ja-JP')}`;

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    const rows = await sql`
      INSERT INTO batch_research_jobs
        (user_id, group_name, topics, schedule_type, scheduled_at, notify_email, status)
      VALUES (
        ${userId},
        ${finalGroupName},
        ${JSON.stringify(topicsWithStatus)},
        ${finalScheduleType},
        ${scheduledAt || null},
        ${notifyEmail || null},
        'pending'
      )
      RETURNING *
    `;

    return NextResponse.json({ job: rows[0] });
  } catch (e: any) {
    console.error('[batch-research POST] エラー:', e);
    return NextResponse.json({ error: e?.message || '登録に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'idが必要です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  await sql`DELETE FROM batch_research_jobs WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
