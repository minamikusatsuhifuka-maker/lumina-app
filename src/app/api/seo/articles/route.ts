import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureSeoMeoSchema } from '@/lib/seo-tools';

export const runtime = 'nodejs';

// 148-1 SEO記事ドラフトの保存・履歴（自動公開はしない）。owner検証。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

export async function GET() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    const rows = await sql`
      SELECT id, keyword, type, content, ad_check, created_at
      FROM seo_articles WHERE owner = ${owner}
      ORDER BY created_at DESC LIMIT 100
    `;
    return NextResponse.json({ articles: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[seo/articles] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { keyword, type, content, adCheck } = await req.json();
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content が必要です' }, { status: 400 });
    }
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    const adJson = adCheck == null ? null : JSON.stringify(adCheck);
    const rows = await sql`
      INSERT INTO seo_articles (owner, keyword, type, content, ad_check)
      VALUES (${owner}, ${keyword ?? ''}, ${type ?? null}, ${content}, ${adJson})
      RETURNING id, keyword, type, content, ad_check, created_at
    `;
    return NextResponse.json({ success: true, article: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[seo/articles] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    await sql`DELETE FROM seo_articles WHERE id = ${id} AND owner = ${owner}`;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[seo/articles] DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
