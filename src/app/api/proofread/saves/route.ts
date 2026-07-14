import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

// 校正の「前後比較つき明示保存」。原文・校正後・適用した修正リストをペアで永続化し、
// 保存一覧からいつでも赤/緑ハイライトつきの比較ビューを再現できるようにする。
// ※ feature_result_drafts(feature_key='proofread') は自動退避＝最新1件の作業復元用で別物。
//    こちらは複数件を残す正式保存。
let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS proofread_saves (
        id BIGSERIAL PRIMARY KEY,
        owner TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '無題テキスト',
        source_text TEXT NOT NULL,
        work_text TEXT NOT NULL,
        corrections JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
      .then(() =>
        sql`
          CREATE INDEX IF NOT EXISTS proofread_saves_owner_created_idx
          ON proofread_saves (owner, created_at DESC)
        `,
      )
      .catch((e) => {
        // 失敗時は次回再試行できるようリセット
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

function getUserId(session: unknown): string {
  return ((session as { user?: { id?: string } })?.user?.id ?? '').trim();
}

// 保存された修正候補1件（161の AppliedFix と同形。reason は表示用に追加保持）
interface RawCorrection {
  original?: unknown;
  suggestion?: unknown;
  line?: unknown;
  scope?: unknown;
  reason?: unknown;
}

// 受け取った corrections を正規化（想定外の値・巨大配列を持ち込まない）
function normalizeCorrections(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 500).map((c: RawCorrection) => ({
    original: String(c?.original ?? ''),
    suggestion: String(c?.suggestion ?? ''),
    line: Number(c?.line) || 0,
    scope: c?.scope === 'all' ? 'all' : 'line',
    reason: String(c?.reason ?? ''),
  }));
}

// 一覧（本文は返さない）/ 単体取得（?id= で本文・修正リストまで返す）
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  try {
    await ensureTable();
    const id = new URL(req.url).searchParams.get('id');

    if (id) {
      const rows = await sql`
        SELECT id, title, source_text, work_text, corrections, created_at
        FROM proofread_saves
        WHERE id = ${id} AND owner = ${userId}
      `;
      if (!rows[0]) {
        return NextResponse.json({ error: '見つかりません' }, { status: 404 });
      }
      return NextResponse.json({ save: rows[0] });
    }

    // 一覧はペイロード対策で本文を返さず、文字数と修正件数のみ
    const rows = await sql`
      SELECT id, title, created_at,
             LENGTH(source_text) AS source_char_count,
             LENGTH(work_text) AS work_char_count,
             COALESCE(jsonb_array_length(corrections), 0) AS fix_count
      FROM proofread_saves
      WHERE owner = ${userId}
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ saves: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[proofread/saves GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 新規保存（原文＋校正後＋適用した修正リストをペアで）
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
    const workText = typeof body.workText === 'string' ? body.workText : '';
    if (!sourceText.trim() || !workText.trim()) {
      return NextResponse.json({ error: '原文・校正後テキストが必要です' }, { status: 400 });
    }
    const title = String(body.title ?? '').trim() || '無題テキスト';
    const corrections = normalizeCorrections(body.corrections);

    await ensureTable();
    const rows = await sql`
      INSERT INTO proofread_saves (owner, title, source_text, work_text, corrections)
      VALUES (${userId}, ${title}, ${sourceText}, ${workText},
              ${JSON.stringify(corrections)}::jsonb)
      RETURNING id, title, created_at
    `;
    return NextResponse.json({ ok: true, save: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[proofread/saves POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 削除（DELETE /api/proofread/saves?id=123）
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'idが必要です' }, { status: 400 });
    await ensureTable();
    await sql`
      DELETE FROM proofread_saves
      WHERE id = ${id} AND owner = ${userId}
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[proofread/saves DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
