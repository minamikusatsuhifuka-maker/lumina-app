import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables } from '@/lib/memo-db';

export const runtime = 'nodejs';

// AIメモ: TODO(ステップ分解)CRUD。

async function ctx() {
  const session = await auth();
  if (!session?.user) return null;
  const owner = (session.user as { id: string }).id;
  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);
  return { owner, sql };
}

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const memoId = typeof body.memo_id === 'string' ? body.memo_id : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!memoId || !title) return NextResponse.json({ error: 'memo_id と title が必要です' }, { status: 400 });

  // memo 所有者確認
  const owns = (await c.sql`SELECT id FROM memos WHERE id = ${memoId} AND owner = ${c.owner}`) as unknown as unknown[];
  if (owns.length === 0) return NextResponse.json({ error: 'メモが見つかりません' }, { status: 404 });

  const rows = await c.sql`
    INSERT INTO memo_todos (memo_id, owner, title, sort_order, due_date)
    VALUES (${memoId}, ${c.owner}, ${title}, ${typeof body.sort_order === 'number' ? body.sort_order : 0}, ${body.due_date || null})
    RETURNING id, memo_id, owner, title, done, sort_order, due_date, created_at
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
  const hasDue = Object.prototype.hasOwnProperty.call(body, 'due_date');
  const due = hasDue ? (body.due_date || null) : null;

  const rows = await c.sql`
    UPDATE memo_todos SET
      title      = COALESCE(${title}, title),
      done       = COALESCE(${done}, done),
      sort_order = COALESCE(${sortOrder}::int, sort_order),
      due_date   = CASE WHEN ${hasDue} THEN ${due}::date ELSE due_date END
    WHERE id = ${id} AND owner = ${c.owner}
    RETURNING id, memo_id, owner, title, done, sort_order, due_date, created_at
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
