import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM handbook_chapters WHERE handbook_id = ${id} ORDER BY order_index`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: handbookId } = await params;
  const { title, content, orderIndex } = await req.json();
  if (!title) return NextResponse.json({ error: 'title は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  await sql`INSERT INTO handbook_chapters (id, handbook_id, title, content, order_index)
    VALUES (${id}, ${handbookId}, ${title}, ${content || ''}, ${orderIndex ?? 0})`;

  return NextResponse.json({ success: true, id });
}
