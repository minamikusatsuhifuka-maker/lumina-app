import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { sql } from '@vercel/postgres';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const result = await sql`SELECT * FROM library WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { type, title, content, metadata } = await req.json();
  const id = uuidv4();
  const userId = (session.user as any).id;
  await sql`INSERT INTO library (id, user_id, type, title, content, metadata) VALUES (${id}, ${userId}, ${type}, ${title}, ${content || ''}, ${JSON.stringify(metadata || {})})`;
  return NextResponse.json({ success: true, id });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  const userId = (session.user as any).id;
  await sql`DELETE FROM library WHERE id = ${id} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
