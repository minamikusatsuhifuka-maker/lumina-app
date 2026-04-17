import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS handbook_model_comparisons (
      id                  SERIAL PRIMARY KEY,
      chapter_id          TEXT NOT NULL,
      chapter_content     TEXT,
      template_label      TEXT,
      sonnet_result       TEXT,
      sonnet_score        INTEGER,
      sonnet_comment      TEXT,
      sonnet_balance      TEXT,
      opus_result         TEXT,
      opus_score          INTEGER,
      opus_comment        TEXT,
      opus_balance        TEXT,
      selected_model      TEXT,
      created_at          TIMESTAMP DEFAULT NOW()
    )
  `;
}

// GET: 章の比較履歴一覧
export async function GET(req: Request) {
  await ensureTable();
  const { searchParams } = new URL(req.url);
  const chapter_id = searchParams.get('chapter_id');
  const rows = await sql`
    SELECT * FROM handbook_model_comparisons
    WHERE chapter_id = ${chapter_id}
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return NextResponse.json({ comparisons: rows });
}

// POST: 比較結果を保存
export async function POST(req: Request) {
  await ensureTable();
  const body = await req.json();
  await sql`
    INSERT INTO handbook_model_comparisons (
      chapter_id, chapter_content, template_label,
      sonnet_result, sonnet_score, sonnet_comment, sonnet_balance,
      opus_result, opus_score, opus_comment, opus_balance,
      selected_model
    ) VALUES (
      ${body.chapter_id}, ${body.chapter_content}, ${body.template_label},
      ${body.sonnet_result}, ${body.sonnet_score}, ${body.sonnet_comment},
      ${JSON.stringify(body.sonnet_balance ?? {})},
      ${body.opus_result}, ${body.opus_score}, ${body.opus_comment},
      ${JSON.stringify(body.opus_balance ?? {})},
      ${body.selected_model ?? null}
    )
  `;
  return NextResponse.json({ ok: true });
}

// PATCH: 採用したモデルを記録
export async function PATCH(req: Request) {
  await ensureTable();
  const { id, selected_model } = await req.json();
  await sql`
    UPDATE handbook_model_comparisons
    SET selected_model = ${selected_model}
    WHERE id = ${id}
  `;
  return NextResponse.json({ ok: true });
}
