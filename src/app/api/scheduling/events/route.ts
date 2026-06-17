import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import {
  ensureSchedulingTables,
  generateEventToken,
  type SchedulingStatus,
} from '@/lib/scheduling';

export const runtime = 'nodejs';

// オーナー専用（要認証）。公開APIはこのフェーズでは作らない。

// POST: イベント作成。owner_user_id はセッションから。公開トークンを返す。
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureSchedulingTables(sql);

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'title が必要です' }, { status: 400 });
  }
  const type: 'one_on_one' | 'multi' = body.type === 'one_on_one' ? 'one_on_one' : 'multi';
  const description = typeof body.description === 'string' ? body.description : null;
  const candidateDates = Array.isArray(body.candidate_dates) ? body.candidate_dates : [];
  const status: SchedulingStatus = 'draft';

  const id = generateEventToken();

  const rows = await sql`
    INSERT INTO scheduling_events
      (id, owner_user_id, title, description, type, status, candidate_dates)
    VALUES
      (${id}, ${userId}, ${title}, ${description}, ${type}, ${status}, ${JSON.stringify(candidateDates)}::jsonb)
    RETURNING id, owner_user_id, title, description, type, status, candidate_dates, finalized_date, created_at, updated_at
  `;

  return NextResponse.json({ event: rows[0], token: id });
}

// GET: 自分のイベント一覧（参加者数・回答数を集計）
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureSchedulingTables(sql);

  const rows = await sql`
    SELECT
      e.id, e.title, e.description, e.type, e.status,
      e.candidate_dates, e.finalized_date, e.created_at, e.updated_at,
      COUNT(p.id)::int AS participant_count,
      COUNT(p.responded_at)::int AS responded_count
    FROM scheduling_events e
    LEFT JOIN scheduling_participants p ON p.event_id = e.id
    WHERE e.owner_user_id = ${userId}
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `;

  return NextResponse.json({ events: rows });
}
