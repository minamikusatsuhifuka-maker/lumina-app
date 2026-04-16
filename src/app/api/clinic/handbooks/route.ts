import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);

  // is_lockedカラムがなければ追加
  await sql`ALTER TABLE handbooks ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE`;

  const rows = await sql`SELECT h.*, (SELECT COUNT(*) FROM handbook_chapters hc WHERE hc.handbook_id = h.id) as chapter_count FROM handbooks h ORDER BY h.updated_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { title, description } = await req.json();
  if (!title) return NextResponse.json({ error: 'title は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  await sql`INSERT INTO handbooks (id, title, description)
    VALUES (${id}, ${title}, ${description || null})`;

  return NextResponse.json({ success: true, id });
}
