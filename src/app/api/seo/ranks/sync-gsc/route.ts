import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureSeoMeoSchema } from '@/lib/seo-tools';
import { fetchSearchConsoleData, GSC_SITE_URL } from '@/lib/gsc-client';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 148-2 追跡キーワードの平均掲載順位を Search Console から取得し、source='gsc' でログ記録。
// 特定地点の“今何位”の実測自動取得はしない（GSCの平均掲載順位を推移として残す）。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

export async function POST() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);

    const keywords = (await sql`
      SELECT keyword FROM seo_keywords WHERE owner = ${owner}
    `) as Array<{ keyword: string }>;
    if (keywords.length === 0) {
      return NextResponse.json({ synced: 0, message: '追跡キーワードがありません' });
    }

    // 直近28日のGSCクエリを取得し、追跡キーワードに一致する平均順位を拾う
    const today = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const data = await fetchSearchConsoleData(GSC_SITE_URL, start, today);

    let synced = 0;
    const results: Array<{ keyword: string; rank: number | null }> = [];
    for (const { keyword } of keywords) {
      // 完全一致優先。無ければ部分一致の最良順位
      const exact = data.queries.find((q) => q.keys[0] === keyword);
      const partial = data.queries
        .filter((q) => q.keys[0]?.includes(keyword))
        .sort((a, b) => a.position - b.position)[0];
      const hit = exact || partial;
      if (hit) {
        await sql`
          INSERT INTO seo_rank_logs (owner, keyword, rank, impressions, clicks, source)
          VALUES (${owner}, ${keyword}, ${hit.position}, ${hit.impressions}, ${hit.clicks}, 'gsc')
        `;
        synced += 1;
        results.push({ keyword, rank: hit.position });
      } else {
        results.push({ keyword, rank: null });
      }
    }

    return NextResponse.json({ synced, results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[seo/ranks/sync-gsc] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
