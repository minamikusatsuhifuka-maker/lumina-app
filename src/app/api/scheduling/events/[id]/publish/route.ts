import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import {
  ensureSchedulingTables,
  canTransition,
  parseCandidateDates,
  type SchedulingStatus,
} from '@/lib/scheduling';

export const runtime = 'nodejs';

// オーナー専用（要auth）。イベントを公開: status draft→collecting。
// candidate_dates（検討対象期間）が未設定なら本リクエストで受け取る。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureSchedulingTables(sql);

  const events = await sql`
    SELECT id, status, candidate_dates
    FROM scheduling_events
    WHERE id = ${id} AND owner_user_id = ${userId}
  `;
  if (events.length === 0) {
    return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });
  }
  const current = events[0].status as SchedulingStatus;

  if (!canTransition(current, 'collecting')) {
    return NextResponse.json(
      { error: `現在の状態(${current})からは公開できません` },
      { status: 409 }
    );
  }

  // candidate_dates: リクエスト指定があればそれを、なければ既存値を採用。
  const body = await req.json().catch(() => ({}));
  const fromBody = parseCandidateDates(body.candidate_dates);
  const existing = parseCandidateDates(events[0].candidate_dates);
  const candidateDates = fromBody.length > 0 ? fromBody : existing;

  if (candidateDates.length === 0) {
    return NextResponse.json(
      { error: '検討対象の候補日（candidate_dates）が必要です' },
      { status: 400 }
    );
  }

  const rows = await sql`
    UPDATE scheduling_events
    SET status = 'collecting',
        candidate_dates = ${JSON.stringify(candidateDates)}::jsonb,
        updated_at = now()
    WHERE id = ${id} AND owner_user_id = ${userId}
    RETURNING id, status, candidate_dates, updated_at
  `;

  return NextResponse.json({ event: rows[0], publicUrl: `/scheduling/${id}` });
}
