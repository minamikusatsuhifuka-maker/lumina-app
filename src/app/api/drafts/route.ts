import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  const rows = await sql`SELECT * FROM drafts WHERE user_id = ${userId} ORDER BY updated_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { title, content, mode } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  const userId = (session.user as any).id;
  await sql`INSERT INTO drafts (id, user_id, title, content, mode) VALUES (${id}, ${userId}, ${title}, ${content || ''}, ${mode || 'blog'})`;
  return NextResponse.json({ success: true, id });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, title, content } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  await sql`UPDATE drafts SET title = ${title}, content = ${content}, updated_at = NOW() WHERE id = ${id} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
