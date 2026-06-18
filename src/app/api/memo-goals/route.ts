import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables } from '@/lib/memo-db';

export const runtime = 'nodejs';

// AIメモ: 目標・目的(memo_goals)CRUD。AI重要度逆算の基準。

async function ctx() {
  const session = await auth();
  if (!session?.user) return null;
  const owner = (session.user as { id: string }).id;
  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);
  return { owner, sql };
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const goals = await c.sql`SELECT id, owner, title, domain, detail, created_at FROM memo_goals WHERE owner = ${c.owner} ORDER BY created_at`;
  return NextResponse.json({ goals });
}

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'title が必要です' }, { status: 400 });
  const domain = typeof body.domain === 'string' && body.domain.trim() ? body.domain.trim() : null;
  const detail = typeof body.detail === 'string' && body.detail.trim() ? body.detail.trim() : null;

  const rows = await c.sql`
    INSERT INTO memo_goals (owner, title, domain, detail) VALUES (${c.owner}, ${title}, ${domain}, ${detail})
    RETURNING id, owner, title, domain, detail, created_at
  `;
  return NextResponse.json({ goal: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;
  const domain = Object.prototype.hasOwnProperty.call(body, 'domain') ? (body.domain || null) : null;
  const detail = Object.prototype.hasOwnProperty.call(body, 'detail') ? (body.detail || null) : null;
  const hasDomain = Object.prototype.hasOwnProperty.call(body, 'domain');
  const hasDetail = Object.prototype.hasOwnProperty.call(body, 'detail');

  const rows = await c.sql`
    UPDATE memo_goals SET
      title  = COALESCE(${title}, title),
      domain = CASE WHEN ${hasDomain} THEN ${domain} ELSE domain END,
      detail = CASE WHEN ${hasDetail} THEN ${detail} ELSE detail END
    WHERE id = ${id} AND owner = ${c.owner}
    RETURNING id, owner, title, domain, detail, created_at
  `;
  if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ goal: rows[0] });
}

export async function DELETE(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
  // memos.goal_ref は ON DELETE SET NULL で参照解除
  await c.sql`DELETE FROM memo_goals WHERE id = ${id} AND owner = ${c.owner}`;
  return NextResponse.json({ success: true });
}
