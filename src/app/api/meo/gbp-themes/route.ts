import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureGbpSchema, loadOrSeedThemes } from '@/lib/gbp-audit';

export const runtime = 'nodejs';

// GBP投稿テーマの取得・追加・編集・削除（owner検証）。
// 初期セットは投入しつつ、院長が編集できる（ハードコードにしない）。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

// 一覧（未登録なら初期セットを投入して返す）
export async function GET() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureGbpSchema(sql);
    const themes = await loadOrSeedThemes(sql, owner);
    return NextResponse.json({ themes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/gbp-themes] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 追加 or 更新（id があれば更新）
export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { id, label, description } = await req.json();
    if (!label || typeof label !== 'string' || !label.trim()) {
      return NextResponse.json({ error: 'label が必要です' }, { status: 400 });
    }
    const sql = neon(process.env.DATABASE_URL!);
    await ensureGbpSchema(sql);

    if (id) {
      // owner 検証付き更新
      const rows = await sql`
        UPDATE gbp_post_themes
        SET label = ${label.trim()}, description = ${description ?? null}
        WHERE id = ${id} AND owner = ${owner}
        RETURNING id, label, description, sort_order
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 });
      }
      return NextResponse.json({ success: true, theme: rows[0] });
    }

    // 末尾に追加（sort_order = 現在の最大+1）
    const maxRows = await sql`
      SELECT COALESCE(MAX(sort_order), -1) AS m FROM gbp_post_themes WHERE owner = ${owner}
    `;
    const nextOrder = Number((maxRows[0] as { m: number }).m) + 1;
    const rows = await sql`
      INSERT INTO gbp_post_themes (owner, label, description, sort_order)
      VALUES (${owner}, ${label.trim()}, ${description ?? null}, ${nextOrder})
      RETURNING id, label, description, sort_order
    `;
    return NextResponse.json({ success: true, theme: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/gbp-themes] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 削除（owner 検証）
export async function DELETE(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
    const sql = neon(process.env.DATABASE_URL!);
    await ensureGbpSchema(sql);
    await sql`DELETE FROM gbp_post_themes WHERE id = ${id} AND owner = ${owner}`;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/gbp-themes] DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
