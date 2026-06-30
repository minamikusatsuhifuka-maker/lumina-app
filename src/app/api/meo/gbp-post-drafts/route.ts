import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureGbpSchema } from '@/lib/gbp-audit';

export const runtime = 'nodejs';

// GBP投稿下書きの保存・履歴（自動投稿はしない）。owner=session.user.id でスコープ。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

// 履歴取得
export async function GET() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureGbpSchema(sql);
    const rows = await sql`
      SELECT id, theme, body, ad_check, created_at
      FROM gbp_post_drafts
      WHERE owner = ${owner}
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return NextResponse.json({ drafts: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/gbp-post-drafts] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 下書きを保存
export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { theme, body, adCheck } = await req.json();
    if (!body || typeof body !== 'string') {
      return NextResponse.json({ error: 'body が必要です' }, { status: 400 });
    }
    const sql = neon(process.env.DATABASE_URL!);
    await ensureGbpSchema(sql);
    const adCheckJson = adCheck == null ? null : JSON.stringify(adCheck);
    const rows = await sql`
      INSERT INTO gbp_post_drafts (owner, theme, body, ad_check)
      VALUES (${owner}, ${theme ?? null}, ${body}, ${adCheckJson})
      RETURNING id, theme, body, ad_check, created_at
    `;
    return NextResponse.json({ success: true, draft: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/gbp-post-drafts] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 履歴削除（owner 検証）
export async function DELETE(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
    const sql = neon(process.env.DATABASE_URL!);
    await ensureGbpSchema(sql);
    await sql`DELETE FROM gbp_post_drafts WHERE id = ${id} AND owner = ${owner}`;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/gbp-post-drafts] DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
