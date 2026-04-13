import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchSearchConsoleData } from '@/lib/gsc-client';

export const runtime = 'nodejs';
export const maxDuration = 120;

const SITE_URL = 'https://www.mkhifuka11.com/';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  // 期間の取得（デフォルト: 過去28日）
  let startDate: string;
  let endDate: string;
  try {
    const body = await req.json().catch(() => ({}));
    const today = new Date().toISOString().split('T')[0];
    endDate =
      body.endDate && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate) ? body.endDate : today;
    startDate =
      body.startDate && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
        ? body.startDate
        : new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    // 最大365日制限
    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    if (diffMs > 365 * 24 * 60 * 60 * 1000) {
      startDate = new Date(new Date(endDate).getTime() - 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
    }
  } catch {
    endDate = new Date().toISOString().split('T')[0];
    startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  try {
    const data = await fetchSearchConsoleData(SITE_URL, startDate, endDate);

    // 集計（クエリ側の合計をサイト全体の値として扱う）
    let totalClicks = 0;
    let totalImpressions = 0;
    let posSum = 0;
    let posCount = 0;
    for (const r of data.queries) {
      totalClicks += r.clicks;
      totalImpressions += r.impressions;
      posSum += r.position;
      posCount++;
    }
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const avgPosition = posCount > 0 ? posSum / posCount : 0;

    const queries = data.queries
      .map((r) => ({
        query: r.keys?.[0] ?? '',
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }))
      .slice(0, 30);
    const pages = data.pages
      .map((r) => ({
        page: r.keys?.[0] ?? '',
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }))
      .slice(0, 20);

    return NextResponse.json({
      success: true,
      siteUrl: SITE_URL,
      startDate,
      endDate,
      totals: {
        clicks: totalClicks,
        impressions: totalImpressions,
        ctr: avgCtr,
        position: avgPosition,
      },
      queries,
      pages,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[gsc/fetch] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
