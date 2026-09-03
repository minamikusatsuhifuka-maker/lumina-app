import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables } from '@/lib/memo-db';
import { normalizeContextRef } from '@/lib/dr-memo';

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
  // 208: 未分類だけ（category_id IS NULL）と、ページング（limit 指定時のみ・上限100・1件多く取って has_more を決める）。
  //   未指定は従来どおり全件＋todos を返す（/dashboard/memo の呼び出しを変えない）。
  const uncategorized = sp.get('uncategorized') === '1';
  const limitRaw = Number(sp.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : null;
  const offsetRaw = Number(sp.get('offset'));
  const offset = limit !== null && Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  const fetchN = limit !== null ? limit + 1 : null; // LIMIT NULL = 制限なし（Postgres）

  // 一覧は本文(raw_text)を含むが、メモは短文想定。肥大化時はここで要約のみ返す方針に切替可。
  const rows = await sql`
    SELECT id, owner, raw_text, status, kind, category_id, importance, urgency,
           quadrant, quadrant_locked, goal_ref, ai_summary, ai_reason, due_at, has_time, completed_at, created_at, triaged_at,
           context_ref
    FROM memos
    WHERE owner = ${owner}
      AND (${status}::text IS NULL OR status = ${status})
      AND (${quadrant}::int IS NULL OR quadrant = ${quadrant}::int)
      AND (${categoryId}::uuid IS NULL OR category_id = ${categoryId}::uuid)
      AND (${uncategorized}::boolean = false OR category_id IS NULL)
    ORDER BY created_at DESC
    LIMIT ${fetchN} OFFSET ${offset}
  `;

  if (limit !== null) {
    const hasMore = rows.length > limit;
    return NextResponse.json({ memos: hasMore ? rows.slice(0, limit) : rows, todos: [], has_more: hasMore, limit, offset });
  }

  const todos = await sql`
    SELECT id, memo_id, owner, title, done, sort_order, due_date, scheduled_date, due_at, has_time, quadrant, completed_at, created_at
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

  // 208: カテゴリ付き・お題つきの作成（任意。未指定は従来どおり未分類の inbox）。
  //   category_id は自分のカテゴリだけ受理（他人のIDは 404 で秘匿）。uuid でない文字列は 400。
  let categoryId: string | null = null;
  if (body.category_id !== undefined && body.category_id !== null && body.category_id !== '') {
    const cid = String(body.category_id);
    if (!/^[0-9a-f-]{36}$/i.test(cid)) return NextResponse.json({ error: 'category_id が不正です' }, { status: 400 });
    const owned = (await sql`SELECT id FROM memo_categories WHERE id = ${cid}::uuid AND owner = ${owner}`) as unknown as { id: string }[];
    if (owned.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    categoryId = owned[0].id;
  }
  const contextRef = normalizeContextRef(body.context_ref);

  const rows = await sql`
    INSERT INTO memos (owner, raw_text, status, category_id, context_ref)
    VALUES (${owner}, ${rawText}, 'inbox', ${categoryId}::uuid, ${contextRef})
    RETURNING *
  `;
  return NextResponse.json({ memo: rows[0] });
}
