import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM staff_notes WHERE staff_id = ${id} ORDER BY created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: staffId } = await params;
  const { type, title, content, authorName } = await req.json();
  if (!title || !content) return NextResponse.json({ error: 'title と content は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  await sql`INSERT INTO staff_notes (id, staff_id, type, title, content, author_name)
    VALUES (${id}, ${staffId}, ${type || 'other'}, ${title}, ${content}, ${authorName || null})`;
  return NextResponse.json({ success: true, id });
}
