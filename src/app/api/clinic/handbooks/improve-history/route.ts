import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const chapterId = searchParams.get('chapterId');
  if (!chapterId) return NextResponse.json({ error: 'chapterId required' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS handbook_improve_histories (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      handbook_id TEXT NOT NULL,
      chapter_title TEXT,
      direction TEXT,
      before_content TEXT NOT NULL,
      after_content TEXT NOT NULL,
      ideology_score INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const rows = await sql`
    SELECT * FROM handbook_improve_histories
    WHERE chapter_id = ${chapterId}
    ORDER BY created_at DESC
    LIMIT 20
  `;

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { chapterId, handbookId, chapterTitle, direction, beforeContent, afterContent, ideologyScore } = await req.json();

  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS handbook_improve_histories (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      handbook_id TEXT NOT NULL,
      chapter_title TEXT,
      direction TEXT,
      before_content TEXT NOT NULL,
      after_content TEXT NOT NULL,
      ideology_score INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const id = uuidv4();
  await sql`
    INSERT INTO handbook_improve_histories (
      id, chapter_id, handbook_id, chapter_title,
      direction, before_content, after_content, ideology_score
    ) VALUES (
      ${id}, ${chapterId}, ${handbookId || ''}, ${chapterTitle || ''},
      ${direction || ''},
      ${beforeContent}, ${afterContent},
      ${ideologyScore || null}
    )
  `;

  return NextResponse.json({ success: true, id });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM handbook_improve_histories WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
