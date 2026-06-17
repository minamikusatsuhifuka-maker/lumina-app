import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureSchedulingTables } from '@/lib/scheduling';

export const runtime = 'nodejs';

// 説明文テンプレートの更新/削除（要auth・created_by 一致を server で検証＝IDOR防止）。

// PATCH: { title?, body? }
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

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : undefined;
  const text = typeof body.body === 'string' ? body.body : undefined;
  if (title === undefined && text === undefined) {
    return NextResponse.json({ error: '更新内容がありません' }, { status: 400 });
  }

  const rows = await sql`
    UPDATE scheduling_description_templates
    SET title = COALESCE(${title ?? null}, title),
        body = COALESCE(${text ?? null}, body),
        updated_at = now()
    WHERE id = ${id} AND created_by = ${userId}
    RETURNING id, title, body, updated_at
  `;
  if (rows.length === 0) return NextResponse.json({ error: '見つかりません' }, { status: 404 });
  return NextResponse.json({ template: rows[0] });
}

// DELETE
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await params;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureSchedulingTables(sql);

  await sql`
    DELETE FROM scheduling_description_templates
    WHERE id = ${id} AND created_by = ${userId}
  `;
  return NextResponse.json({ ok: true });
}
