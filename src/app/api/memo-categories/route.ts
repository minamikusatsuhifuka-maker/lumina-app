import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables } from '@/lib/memo-db';

export const runtime = 'nodejs';

// AIメモ: カテゴリCRUD(AI自動分類・ユーザー編集可)。

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
  // 208: 各カテゴリのメモ件数と手動並び順を併せて返す（並びは sort_order → 作成順。既存データは全て 0 なので従来どおり作成順）
  const categories = await c.sql`
    SELECT c.id, c.owner, c.name, c.color, c.is_auto, c.sort_order, c.created_at,
           (SELECT COUNT(*) FROM memos m WHERE m.category_id = c.id AND m.owner = c.owner)::int AS memo_count
    FROM memo_categories c
    WHERE c.owner = ${c.owner}
    ORDER BY c.sort_order, c.created_at
  `;
  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name が必要です' }, { status: 400 });

  const existing = (await c.sql`SELECT id, owner, name, color, is_auto, sort_order, created_at FROM memo_categories WHERE owner = ${c.owner} AND name = ${name} LIMIT 1`) as unknown as unknown[];
  if (existing.length > 0) return NextResponse.json({ category: existing[0] });

  const rows = await c.sql`
    INSERT INTO memo_categories (owner, name, color, is_auto) VALUES (${c.owner}, ${name}, ${body.color ?? null}, false)
    RETURNING id, owner, name, color, is_auto, sort_order, created_at
  `;
  return NextResponse.json({ category: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  const hasColor = Object.prototype.hasOwnProperty.call(body, 'color');
  const color = hasColor ? (body.color || null) : null;
  // 208: 手動並び順（▲▼）。未指定は現値維持
  const sortOrder = typeof body.sort_order === 'number' && Number.isFinite(body.sort_order) ? Math.round(body.sort_order) : null;

  const rows = await c.sql`
    UPDATE memo_categories SET
      name  = COALESCE(${name}, name),
      color = CASE WHEN ${hasColor} THEN ${color} ELSE color END,
      sort_order = COALESCE(${sortOrder}::int, sort_order)
    WHERE id = ${id} AND owner = ${c.owner}
    RETURNING id, owner, name, color, is_auto, sort_order, created_at
  `;
  if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ category: rows[0] });
}

export async function DELETE(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
  // memos.category_id は ON DELETE SET NULL で参照解除
  await c.sql`DELETE FROM memo_categories WHERE id = ${id} AND owner = ${c.owner}`;
  return NextResponse.json({ success: true });
}
