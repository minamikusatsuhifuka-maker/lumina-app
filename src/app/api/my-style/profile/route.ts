import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { sql } from '@/lib/db';
import { normalizeMyStyleProfile } from '@/lib/my-style';

export const runtime = 'nodejs';

// 228c: マイ文体プロファイル（owner 1行・JSONB・編集可能・enabledトグル）。
// 書き込みはこのルートのみ（extract は下書きを返すだけで保存しない＝人間確認型）。
let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS my_style_profiles (
        owner      TEXT PRIMARY KEY,
        profile    JSONB NOT NULL,
        enabled    BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.catch((e) => {
      tableReady = null;
      throw e;
    });
  }
  return tableReady;
}

export async function GET() {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  try {
    await ensureTable();
    const [row] = await sql`
      SELECT profile, enabled, updated_at FROM my_style_profiles WHERE owner = ${guard.userId}
    `;
    if (!row) return NextResponse.json({ profile: null, enabled: false });
    return NextResponse.json({
      profile: normalizeMyStyleProfile(row.profile),
      enabled: Boolean(row.enabled),
      updated_at: row.updated_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[my-style/profile GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  try {
    const body = (await req.json().catch(() => ({}))) as { profile?: unknown; enabled?: unknown };
    const profile = normalizeMyStyleProfile(body.profile);
    if (!profile) {
      return NextResponse.json({ error: 'プロファイルの形式が不正です（実質空のプロファイルは保存できません）' }, { status: 400 });
    }
    const enabled = body.enabled !== false;
    await ensureTable();
    await sql`
      INSERT INTO my_style_profiles (owner, profile, enabled, updated_at)
      VALUES (${guard.userId}, ${JSON.stringify(profile)}::jsonb, ${enabled}, now())
      ON CONFLICT (owner) DO UPDATE SET
        profile = EXCLUDED.profile, enabled = EXCLUDED.enabled, updated_at = now()
    `;
    return NextResponse.json({ ok: true, profile, enabled });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[my-style/profile PUT]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  try {
    await ensureTable();
    await sql`DELETE FROM my_style_profiles WHERE owner = ${guard.userId}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[my-style/profile DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
