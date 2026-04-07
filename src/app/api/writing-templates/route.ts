import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  const rows = await sql`SELECT * FROM writing_templates WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, mode, style, length, audience, prompt } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: 'テンプレート名は必須です' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  const rows = await sql`INSERT INTO writing_templates (user_id, name, mode, style, length, audience, prompt)
    VALUES (${userId}, ${name.trim()}, ${mode}, ${style}, ${length}, ${audience}, ${prompt || ''})
    RETURNING *`;
  return NextResponse.json(rows[0]);
}
