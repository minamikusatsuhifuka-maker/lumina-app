export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS handbook_chapter_questions (
      id              SERIAL PRIMARY KEY,
      chapter_id      TEXT NOT NULL,
      chapter_content TEXT,
      level_label     TEXT NOT NULL,
      level_desc      TEXT,
      question_text   TEXT NOT NULL,
      is_selected     BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMP DEFAULT NOW()
    )
  `;
}

// GET: 章の保存済み問いかけ一覧
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureTable();
  const { searchParams } = new URL(req.url);
  const chapter_id = searchParams.get('chapter_id');
  if (!chapter_id) return NextResponse.json({ questions: [] });

  const questions = await sql`
    SELECT * FROM handbook_chapter_questions
    WHERE chapter_id = ${chapter_id}
    ORDER BY created_at DESC
  `;
  return NextResponse.json({ questions });
}

// POST: 問いかけを保存
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureTable();
  const { chapter_id, chapter_content, level_label, level_desc, question_text } = await req.json();

  if (!chapter_id || !level_label || !question_text) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });
  }

  await sql`
    INSERT INTO handbook_chapter_questions
      (chapter_id, chapter_content, level_label, level_desc, question_text)
    VALUES
      (${chapter_id}, ${chapter_content ?? ''}, ${level_label}, ${level_desc ?? ''}, ${question_text})
  `;
  return NextResponse.json({ ok: true });
}
