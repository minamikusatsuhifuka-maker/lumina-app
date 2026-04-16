import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, chapterId } = await params;
  const body = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  // ロック確認
  const handbook = await sql`SELECT is_locked FROM handbooks WHERE id = ${id}`;
  if (handbook[0]?.is_locked) {
    return NextResponse.json({ error: 'ロック中のため変更できません' }, { status: 403 });
  }

  if (body.title !== undefined) await sql`UPDATE handbook_chapters SET title = ${body.title}, last_edited_at = NOW() WHERE id = ${chapterId}`;
  if (body.content !== undefined) await sql`UPDATE handbook_chapters SET content = ${body.content}, last_edited_at = NOW() WHERE id = ${chapterId}`;

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, chapterId } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  // ロック確認
  const handbook = await sql`SELECT is_locked FROM handbooks WHERE id = ${id}`;
  if (handbook[0]?.is_locked) {
    return NextResponse.json({ error: 'ロック中のため削除できません' }, { status: 403 });
  }

  await sql`DELETE FROM handbook_chapters WHERE id = ${chapterId}`;
  return NextResponse.json({ success: true });
}
