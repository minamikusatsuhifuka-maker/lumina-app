import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

// 機能別「最新の実行結果」自動下書きテーブル（owner×featureで1行のみ保持）
// 履歴・正式保存は既存の手動保存（text_analysis_saves / context_saves 等）に任せる
let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS feature_result_drafts (
        owner TEXT NOT NULL,
        feature_key TEXT NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (owner, feature_key)
      )
    `.catch((e) => {
      // 失敗時は次回再試行できるようリセット
      tableReady = null;
      throw e;
    });
  }
  return tableReady;
}

// feature_key はコード内で定義したスラッグのみ許可（自由入力を防ぐ）
const FEATURE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function getUserId(session: unknown): string {
  return ((session as { user?: { id?: string } })?.user?.id ?? '').trim();
}

// 最新の下書き取得: GET /api/feature-drafts?feature=text-analysis
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  try {
    const feature = new URL(req.url).searchParams.get('feature') ?? '';
    if (!FEATURE_KEY_PATTERN.test(feature)) {
      return NextResponse.json({ error: 'featureが不正です' }, { status: 400 });
    }
    await ensureTable();
    const rows = await sql`
      SELECT payload, updated_at
      FROM feature_result_drafts
      WHERE owner = ${userId} AND feature_key = ${feature}
    `;
    return NextResponse.json({ draft: rows[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[feature-drafts GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 自動保存（UPSERT・最新1件のみ）: PUT /api/feature-drafts { feature, payload }
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const feature = typeof body.feature === 'string' ? body.feature : '';
    if (!FEATURE_KEY_PATTERN.test(feature)) {
      return NextResponse.json({ error: 'featureが不正です' }, { status: 400 });
    }
    if (!body.payload || typeof body.payload !== 'object') {
      return NextResponse.json({ error: 'payloadが不正です' }, { status: 400 });
    }
    await ensureTable();
    const rows = await sql`
      INSERT INTO feature_result_drafts (owner, feature_key, payload, updated_at)
      VALUES (${userId}, ${feature}, ${JSON.stringify(body.payload)}::jsonb, NOW())
      ON CONFLICT (owner, feature_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      RETURNING updated_at
    `;
    return NextResponse.json({ ok: true, updated_at: rows[0]?.updated_at ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[feature-drafts PUT]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 下書きクリア: DELETE /api/feature-drafts?feature=text-analysis
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDが取得できません' }, { status: 400 });
  }

  try {
    const feature = new URL(req.url).searchParams.get('feature') ?? '';
    if (!FEATURE_KEY_PATTERN.test(feature)) {
      return NextResponse.json({ error: 'featureが不正です' }, { status: 400 });
    }
    await ensureTable();
    await sql`
      DELETE FROM feature_result_drafts
      WHERE owner = ${userId} AND feature_key = ${feature}
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[feature-drafts DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
