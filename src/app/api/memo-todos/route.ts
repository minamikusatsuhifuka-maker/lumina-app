import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables } from '@/lib/memo-db';

export const runtime = 'nodejs';

// AIメモ: TODO(ステップ分解)CRUD + 横断取得。
// Phase2: メモをまたいだ実行リスト(象限優先)・締切/予定日・カレンダー連携の土台。

async function ctx() {
  const session = await auth();
  if (!session?.user) return null;
  const owner = (session.user as { id: string }).id;
  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);
  return { owner, sql };
}

// 横断TODO取得。由来メモの要約/カテゴリ/目標を結合し、TODOの象限が無ければメモの象限を採用。
// クエリ: status=open|done / quadrant=1..4(実効象限) / due_before=YYYY-MM-DD / category_id
export async function GET(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status'); // 'open' | 'done' | null(全件)
  const quadrant = sp.get('quadrant'); // '1'..'4' | null
  const dueBefore = sp.get('due_before'); // YYYY-MM-DD | null
  const categoryId = sp.get('category_id');

  const doneFilter = status === 'done' ? true : status === 'open' ? false : null;

  const rows = await c.sql`
    SELECT t.id, t.memo_id, t.owner, t.title, t.done, t.sort_order,
           t.due_date, t.scheduled_date, t.due_at, t.has_time, t.completed_at, t.created_at,
           COALESCE(t.quadrant, m.quadrant) AS quadrant,
           m.ai_summary AS memo_summary, m.raw_text AS memo_text,
           m.category_id, m.goal_ref
    FROM memo_todos t
    JOIN memos m ON m.id = t.memo_id AND m.owner = t.owner
    WHERE t.owner = ${c.owner}
      AND (${doneFilter}::boolean IS NULL OR t.done = ${doneFilter})
      AND (${quadrant}::int IS NULL OR COALESCE(t.quadrant, m.quadrant) = ${quadrant}::int)
      AND (${dueBefore}::date IS NULL OR (t.due_date IS NOT NULL AND t.due_date <= ${dueBefore}::date))
      AND (${categoryId}::uuid IS NULL OR m.category_id = ${categoryId}::uuid)
    ORDER BY
      t.done ASC,
      COALESCE(t.quadrant, m.quadrant, 4) ASC,
      COALESCE(t.due_date, t.scheduled_date) ASC NULLS LAST,
      t.sort_order ASC
  `;
  return NextResponse.json({ todos: rows });
}

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const memoId = typeof body.memo_id === 'string' ? body.memo_id : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!memoId || !title) return NextResponse.json({ error: 'memo_id と title が必要です' }, { status: 400 });

  // memo 所有者確認(象限の引き継ぎ元としても利用)
  const owns = (await c.sql`SELECT quadrant FROM memos WHERE id = ${memoId} AND owner = ${c.owner}`) as unknown as { quadrant: number | null }[];
  if (owns.length === 0) return NextResponse.json({ error: 'メモが見つかりません' }, { status: 404 });

  const quadrant = typeof body.quadrant === 'number' ? body.quadrant : (owns[0].quadrant ?? null);

  const rows = await c.sql`
    INSERT INTO memo_todos (memo_id, owner, title, sort_order, due_date, scheduled_date, due_at, has_time, quadrant)
    VALUES (
      ${memoId}, ${c.owner}, ${title},
      ${typeof body.sort_order === 'number' ? body.sort_order : 0},
      ${body.due_date || null}, ${body.scheduled_date || null},
      ${body.due_at || null}, ${typeof body.has_time === 'boolean' ? body.has_time : false}, ${quadrant}
    )
    RETURNING id, memo_id, owner, title, done, sort_order, due_date, scheduled_date, due_at, has_time, quadrant, completed_at, created_at
  `;
  return NextResponse.json({ todo: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;
  const done = typeof body.done === 'boolean' ? body.done : null;
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : null;
  const quadrant = typeof body.quadrant === 'number' ? body.quadrant : null;
  const hasDue = Object.prototype.hasOwnProperty.call(body, 'due_date');
  const due = hasDue ? (body.due_date || null) : null;
  const hasSched = Object.prototype.hasOwnProperty.call(body, 'scheduled_date');
  const sched = hasSched ? (body.scheduled_date || null) : null;
  const hasDueAt = Object.prototype.hasOwnProperty.call(body, 'due_at');
  const dueAt = hasDueAt ? (body.due_at || null) : null;
  const hasTime = typeof body.has_time === 'boolean' ? body.has_time : null;

  const rows = await c.sql`
    UPDATE memo_todos SET
      title          = COALESCE(${title}, title),
      done           = COALESCE(${done}, done),
      sort_order     = COALESCE(${sortOrder}::int, sort_order),
      quadrant       = COALESCE(${quadrant}::int, quadrant),
      due_date       = CASE WHEN ${hasDue} THEN ${due}::date ELSE due_date END,
      scheduled_date = CASE WHEN ${hasSched} THEN ${sched}::date ELSE scheduled_date END,
      due_at         = CASE WHEN ${hasDueAt} THEN ${dueAt}::timestamptz ELSE due_at END,
      has_time       = COALESCE(${hasTime}::boolean, has_time),
      -- 122: チェックで完了→completed_at セット(既存値維持)、未完了化で NULL。
      completed_at   = CASE
        WHEN ${done}::boolean IS TRUE THEN COALESCE(completed_at, now())
        WHEN ${done}::boolean IS FALSE THEN NULL
        ELSE completed_at END
    WHERE id = ${id} AND owner = ${c.owner}
    RETURNING id, memo_id, owner, title, done, sort_order, due_date, scheduled_date, due_at, has_time, quadrant, completed_at, created_at
  `;
  if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ todo: rows[0] });
}

export async function DELETE(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
  await c.sql`DELETE FROM memo_todos WHERE id = ${id} AND owner = ${c.owner}`;
  return NextResponse.json({ success: true });
}
