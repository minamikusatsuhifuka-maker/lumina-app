import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { sql } from '@vercel/postgres';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const result = await sql`SELECT * FROM alerts WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { topic, frequency } = await req.json();
  const id = uuidv4();
  const userId = (session.user as any).id;
  await sql`INSERT INTO alerts (id, user_id, topic, frequency) VALUES (${id}, ${userId}, ${topic}, ${frequency || 'weekly'})`;
  return NextResponse.json({ success: true, id });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  const userId = (session.user as any).id;
  await sql`DELETE FROM alerts WHERE id = ${id} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
