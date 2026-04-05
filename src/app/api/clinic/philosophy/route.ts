import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  return NextResponse.json(rows[0] || null);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { title, content } = await req.json();
  if (!title || !content) return NextResponse.json({ error: 'title と content は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);

  // 既存レコードがあれば更新、なければ作成
  const existing = await sql`SELECT id FROM clinic_philosophy LIMIT 1`;
  if (existing.length > 0) {
    await sql`UPDATE clinic_philosophy SET title = ${title}, content = ${content}, updated_at = CURRENT_TIMESTAMP WHERE id = ${existing[0].id}`;
    return NextResponse.json({ success: true, id: existing[0].id });
  } else {
    const id = uuidv4();
    await sql`INSERT INTO clinic_philosophy (id, title, content) VALUES (${id}, ${title}, ${content})`;
    return NextResponse.json({ success: true, id });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM clinic_philosophy`;
  return NextResponse.json({ success: true });
}
