import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureSeoMeoSchema } from '@/lib/seo-tools';

export const runtime = 'nodejs';

// 148-2 追跡キーワードの登録・削除（owner検証・院長が編集可）

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
      SELECT id, keyword, target_url, created_at
      FROM seo_keywords WHERE owner = ${owner}
      ORDER BY created_at ASC
    `;
    return NextResponse.json({ keywords: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[seo/keywords] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { keyword, targetUrl } = await req.json();
    if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
      return NextResponse.json({ error: 'keyword が必要です' }, { status: 400 });
    }
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    const rows = await sql`
      INSERT INTO seo_keywords (owner, keyword, target_url)
      VALUES (${owner}, ${keyword.trim()}, ${targetUrl ?? null})
      ON CONFLICT (owner, keyword) DO UPDATE SET target_url = EXCLUDED.target_url
      RETURNING id, keyword, target_url, created_at
    `;
    return NextResponse.json({ success: true, keyword: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[seo/keywords] POST error:', message);
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
    await sql`DELETE FROM seo_keywords WHERE id = ${id} AND owner = ${owner}`;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[seo/keywords] DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
