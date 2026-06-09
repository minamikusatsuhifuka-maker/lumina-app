import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

// ディープリサーチの検索ワード（お題）履歴API
// 実際にリサーチが実行されたワードだけ保存し、入力欄の候補表示に使う

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS research_query_history (
      id         SERIAL PRIMARY KEY,
      user_id    TEXT NOT NULL,
      query      TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // user_id での絞り込み・新しい順取得を高速化
  await sql`
    CREATE INDEX IF NOT EXISTS idx_research_query_history_user_created
    ON research_query_history (user_id, created_at DESC)
  `;
}

// 直近の検索ワード履歴を取得（重複除去・新しい順）
export async function GET() {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    await ensureTable();
    const rows = await sql`
      SELECT query, MAX(created_at) AS last_used
      FROM research_query_history
      WHERE user_id = ${userId}
      GROUP BY query
      ORDER BY last_used DESC
      LIMIT 30
    `;
    return NextResponse.json({ queries: rows.map((r) => ({ query: r.query as string })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[deepresearch/query-history GET]', message);
    // 履歴取得の失敗は本体に影響させない（空で返す）
    return NextResponse.json({ queries: [] });
  }
}

// 実行された検索ワードを保存（fire-and-forget で呼ばれる）
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';
  if (!userId) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const { query } = await req.json();
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (!trimmed) return NextResponse.json({ ok: false }, { status: 400 });

    await ensureTable();
    // 同じワードの古い記録は消してから入れ直す（重複を貯めず最新の実行日時に寄せる）
    await sql`
      DELETE FROM research_query_history
      WHERE user_id = ${userId} AND query = ${trimmed}
    `;
    await sql`
      INSERT INTO research_query_history (user_id, query)
      VALUES (${userId}, ${trimmed})
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[deepresearch/query-history POST]', message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
