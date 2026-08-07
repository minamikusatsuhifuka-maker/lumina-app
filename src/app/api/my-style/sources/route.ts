import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { sql } from '@/lib/db';
import {
  MY_STYLE_MAX_SOURCES,
  MY_STYLE_SOURCE_MAX_CHARS,
  MY_STYLE_SOURCE_MIN_CHARS,
} from '@/lib/my-style';

export const runtime = 'nodejs';

// 228c: マイ文体ソース（院長自身の文章のみ）の管理。
// 文体ソースはこのテーブルだけが正（library等のAI生成物・他者コンテンツは絶対に使わない）。
// ensureTable方式＝手動SQL不要（feature-drafts と同じキャッシュ・失敗時再試行パターン）。
let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS my_style_sources (
        id         SERIAL PRIMARY KEY,
        owner      TEXT NOT NULL,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL,
        char_count INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
      .then(
        () => sql`
          CREATE INDEX IF NOT EXISTS idx_my_style_sources_owner
          ON my_style_sources(owner, created_at DESC)
        `,
      )
      .catch((e) => {
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

// 一覧（本文は文字数のみ返す＝175の一覧本文非返却方針を踏襲。本文表示は現状不要）
export async function GET() {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  try {
    await ensureTable();
    const rows = await sql`
      SELECT id, title, char_count, created_at FROM my_style_sources
      WHERE owner = ${guard.userId} ORDER BY created_at DESC
    `;
    return NextResponse.json({ sources: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[my-style/sources GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 登録（貼り付け）。本人性はUIの注意書き＋院長の自己申告で担保（アプリからは検証不能のため
// 「自分が書いた文章のみ」を登録画面で明示する）
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  try {
    const body = (await req.json().catch(() => ({}))) as { title?: unknown; content?: unknown };
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 100) : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (content.length < MY_STYLE_SOURCE_MIN_CHARS) {
      return NextResponse.json(
        { error: `本文は${MY_STYLE_SOURCE_MIN_CHARS}字以上で登録してください（文体の特徴が取れないため）` },
        { status: 400 },
      );
    }
    if (content.length > MY_STYLE_SOURCE_MAX_CHARS) {
      return NextResponse.json(
        { error: `本文は${MY_STYLE_SOURCE_MAX_CHARS.toLocaleString()}字以内で登録してください` },
        { status: 400 },
      );
    }
    await ensureTable();
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM my_style_sources WHERE owner = ${guard.userId}
    `;
    if (Number(count) >= MY_STYLE_MAX_SOURCES) {
      return NextResponse.json(
        { error: `ソースは最大${MY_STYLE_MAX_SOURCES}件です（不要なものを削除してください）` },
        { status: 400 },
      );
    }
    const [row] = await sql`
      INSERT INTO my_style_sources (owner, title, content, char_count)
      VALUES (${guard.userId}, ${title || '無題'}, ${content}, ${content.length})
      RETURNING id, title, char_count, created_at
    `;
    return NextResponse.json({ source: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[my-style/sources POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'idが必要です' }, { status: 400 });
    await ensureTable();
    const rows = await sql`
      DELETE FROM my_style_sources WHERE id = ${id} AND owner = ${guard.userId} RETURNING id
    `;
    if (rows.length === 0) return NextResponse.json({ error: '対象がありません' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[my-style/sources DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
