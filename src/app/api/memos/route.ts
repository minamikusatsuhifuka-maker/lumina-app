import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables } from '@/lib/memo-db';

export const runtime = 'nodejs';

// AIメモ: 一覧取得 / 生メモ作成。owner はセッションから(IDOR防止)。

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = (session.user as { id: string }).id;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const quadrant = sp.get('quadrant');
  const categoryId = sp.get('category_id');

  // 一覧は本文(raw_text)を含むが、メモは短文想定。肥大化時はここで要約のみ返す方針に切替可。
  const rows = await sql`
    SELECT id, owner, raw_text, status, kind, category_id, importance, urgency,
           quadrant, goal_ref, ai_summary, ai_reason, created_at, triaged_at
    FROM memos
    WHERE owner = ${owner}
      AND (${status}::text IS NULL OR status = ${status})
      AND (${quadrant}::int IS NULL OR quadrant = ${quadrant}::int)
      AND (${categoryId}::uuid IS NULL OR category_id = ${categoryId}::uuid)
    ORDER BY created_at DESC
  `;

  const todos = await sql`
    SELECT id, memo_id, owner, title, done, sort_order, due_date, created_at
    FROM memo_todos WHERE owner = ${owner} ORDER BY sort_order
  `;

  return NextResponse.json({ memos: rows, todos });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = (session.user as { id: string }).id;

  const body = await req.json().catch(() => ({}));
  const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : '';
  if (!rawText) return NextResponse.json({ error: 'raw_text が必要です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);

  const rows = await sql`
    INSERT INTO memos (owner, raw_text, status) VALUES (${owner}, ${rawText}, 'inbox')
    RETURNING *
  `;
  return NextResponse.json({ memo: rows[0] });
}
