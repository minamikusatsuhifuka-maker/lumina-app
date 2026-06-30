import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureSeoMeoSchema } from '@/lib/seo-tools';

export const runtime = 'nodejs';

// 148-2 順位ログ（推移）の取得・手入力記録。owner検証。
// source='gsc'|'manual'|'serpapi'。GSC同期は別ルート（ranks/sync-gsc）。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

// 追跡キーワードごとのログ（推移）を返す
export async function GET() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    const logs = await sql`
      SELECT id, keyword, rank, impressions, clicks, source, logged_at
      FROM seo_rank_logs WHERE owner = ${owner}
      ORDER BY logged_at ASC
    `;
    return NextResponse.json({ logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[seo/ranks] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 手入力で順位を記録
export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { keyword, rank } = await req.json();
    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json({ error: 'keyword が必要です' }, { status: 400 });
    }
    const rankNum = Number(rank);
    if (!Number.isFinite(rankNum) || rankNum <= 0) {
      return NextResponse.json({ error: 'rank が不正です' }, { status: 400 });
    }
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    const rows = await sql`
      INSERT INTO seo_rank_logs (owner, keyword, rank, source)
      VALUES (${owner}, ${keyword}, ${rankNum}, 'manual')
      RETURNING id, keyword, rank, impressions, clicks, source, logged_at
    `;
    return NextResponse.json({ success: true, log: rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[seo/ranks] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
