import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { sql } from '@vercel/postgres';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const result = await sql`SELECT * FROM personas WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, industry, role, system_prompt } = await req.json();
  const id = uuidv4();
  const userId = (session.user as any).id;
  // 既存を非アクティブに
  await sql`UPDATE personas SET is_active = 0 WHERE user_id = ${userId}`;
  await sql`INSERT INTO personas (id, user_id, name, industry, role, system_prompt, is_active) VALUES (${id}, ${userId}, ${name}, ${industry}, ${role}, ${system_prompt}, 1)`;
  return NextResponse.json({ success: true, id });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, is_active } = await req.json();
  const userId = (session.user as any).id;
  if (is_active) await sql`UPDATE personas SET is_active = 0 WHERE user_id = ${userId}`;
  await sql`UPDATE personas SET is_active = ${is_active} WHERE id = ${id} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  const userId = (session.user as any).id;
  await sql`DELETE FROM personas WHERE id = ${id} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
