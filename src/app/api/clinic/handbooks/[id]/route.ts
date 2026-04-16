import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  const [handbookRows, chapterRows] = await Promise.all([
    sql`SELECT * FROM handbooks WHERE id = ${id}`,
    sql`SELECT * FROM handbook_chapters WHERE handbook_id = ${id} ORDER BY order_index`,
  ]);

  if (!handbookRows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    ...handbookRows[0],
    chapters: chapterRows,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  // ロック確認
  const handbook = await sql`SELECT is_locked FROM handbooks WHERE id = ${id}`;
  if (handbook[0]?.is_locked) {
    return NextResponse.json({ error: 'ロック中のため変更できません' }, { status: 403 });
  }

  const body = await req.json();
  if (body.title !== undefined) await sql`UPDATE handbooks SET title = ${body.title}, updated_at = NOW() WHERE id = ${id}`;
  if (body.description !== undefined) await sql`UPDATE handbooks SET description = ${body.description}, updated_at = NOW() WHERE id = ${id}`;
  if (body.status !== undefined) await sql`UPDATE handbooks SET status = ${body.status}, updated_at = NOW() WHERE id = ${id}`;

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  // ロック確認
  const handbook = await sql`SELECT is_locked FROM handbooks WHERE id = ${id}`;
  if (handbook[0]?.is_locked) {
    return NextResponse.json({ error: 'ロック中のため削除できません' }, { status: 403 });
  }

  await sql`DELETE FROM handbook_chapters WHERE handbook_id = ${id}`;
  await sql`DELETE FROM handbooks WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
