import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables } from '@/lib/memo-db';

export const runtime = 'nodejs';

// 127: 週次Q2レビューの「今週フォーカスに選んだメモ」記録。
//   GET ?week=YYYY-MM-DD → その週のpick一覧（owner検証）
//   POST { week, memo_ids[] } → その週のpickを置き換え（owner検証・IDOR防止）

async function ctx() {
  const session = await auth();
  if (!session?.user) return null;
  const owner = (session.user as { id: string }).id;
  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);
  return { owner, sql };
}

export async function GET(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const week = req.nextUrl.searchParams.get('week');
  if (!week) return NextResponse.json({ error: 'week が必要です' }, { status: 400 });
  const picks = await c.sql`
    SELECT memo_id, week, created_at FROM memo_focus_picks
    WHERE owner = ${c.owner} AND week = ${week}
  `;
  return NextResponse.json({ picks });
}

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const week = typeof body.week === 'string' ? body.week.trim() : '';
  const memoIds: string[] = Array.isArray(body.memo_ids) ? body.memo_ids.filter((x: unknown) => typeof x === 'string').slice(0, 10) : [];
  if (!week) return NextResponse.json({ error: 'week が必要です' }, { status: 400 });

  // その週のpickを総入れ替え（選び直しに対応）。memo は owner のもののみ受理。
  await c.sql`DELETE FROM memo_focus_picks WHERE owner = ${c.owner} AND week = ${week}`;
  for (const memoId of memoIds) {
    // owner所有のメモのみ記録（IDOR防止）。ON CONFLICT で多重防止。
    await c.sql`
      INSERT INTO memo_focus_picks (owner, memo_id, week)
      SELECT ${c.owner}, ${memoId}::uuid, ${week}
      WHERE EXISTS (SELECT 1 FROM memos WHERE id = ${memoId}::uuid AND owner = ${c.owner})
      ON CONFLICT (owner, memo_id, week) DO NOTHING
    `;
  }

  const picks = await c.sql`
    SELECT memo_id, week, created_at FROM memo_focus_picks
    WHERE owner = ${c.owner} AND week = ${week}
  `;
  return NextResponse.json({ picks });
}
