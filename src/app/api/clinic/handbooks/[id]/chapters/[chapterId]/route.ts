import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { chapterId } = await params;
  const body = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  if (body.title !== undefined) await sql`UPDATE handbook_chapters SET title = ${body.title}, last_edited_at = NOW() WHERE id = ${chapterId}`;
  if (body.content !== undefined) await sql`UPDATE handbook_chapters SET content = ${body.content}, last_edited_at = NOW() WHERE id = ${chapterId}`;

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { chapterId } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM handbook_chapters WHERE id = ${chapterId}`;
  return NextResponse.json({ success: true });
}
