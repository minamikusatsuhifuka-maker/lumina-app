import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureSchedulingTables, parseTimeSlots } from '@/lib/scheduling';

export const runtime = 'nodejs';

// オーナー専用（要認証）。自分のイベント詳細＋参加者＋NG集計。
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureSchedulingTables(sql);

  // 本人のイベントのみ（owner_user_id で絞り、他人のイベントは404扱い）
  const events = await sql`
    SELECT id, owner_user_id, title, description, type, status,
           candidate_dates, time_slots, finalized_date, compute_result, created_at, updated_at
    FROM scheduling_events
    WHERE id = ${id} AND owner_user_id = ${userId}
  `;
  if (events.length === 0) {
    return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });
  }

  // 参加者（NG日も配列で同梱。1対1の選択枠 selected_slot も）
  const participants = await sql`
    SELECT
      p.id, p.email, p.name, p.email_verified_at, p.responded_at, p.selected_slot, p.created_at,
      COALESCE(
        ARRAY_AGG(n.ng_date ORDER BY n.ng_date) FILTER (WHERE n.ng_date IS NOT NULL),
        ARRAY[]::date[]
      ) AS ng_dates
    FROM scheduling_participants p
    LEFT JOIN scheduling_ng_dates n ON n.participant_id = p.id
    WHERE p.event_id = ${id}
    GROUP BY p.id
    ORDER BY p.created_at ASC
  `;

  // NG日の集計（日付ごとに何人がNGか）
  const ngSummary = await sql`
    SELECT ng_date, COUNT(DISTINCT participant_id)::int AS ng_count
    FROM scheduling_ng_dates
    WHERE event_id = ${id}
    GROUP BY ng_date
    ORDER BY ng_date ASC
  `;

  return NextResponse.json({
    event: events[0],
    participants,
    ngSummary,
  });
}

// オーナー専用。draft のときのみ time_slots を編集（1対1の枠調整）。公開後は不可。
export async function PATCH(
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
    SELECT status FROM scheduling_events WHERE id = ${id} AND owner_user_id = ${userId}
  `;
  if (events.length === 0) {
    return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 });
  }
  if (events[0].status !== 'draft') {
    return NextResponse.json({ error: '公開後は編集できません' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const timeSlots = parseTimeSlots(body.time_slots);

  const rows = await sql`
    UPDATE scheduling_events
    SET time_slots = ${JSON.stringify(timeSlots)}::jsonb, updated_at = now()
    WHERE id = ${id} AND owner_user_id = ${userId}
    RETURNING id, time_slots
  `;
  return NextResponse.json({ event: rows[0] });
}
