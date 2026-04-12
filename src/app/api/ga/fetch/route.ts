import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { fetchGaData, fetchTopPages, fetchReferralSources } from '@/lib/ga-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;

  const propertyId = process.env.GA4_PROPERTY_ID!;
  if (!propertyId) {
    return NextResponse.json({ error: 'GA4_PROPERTY_ID が設定されていません' }, { status: 500 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // リクエストボディから期間を取得（デフォルト: 過去7日）
  let startDate: string;
  let endDate: string;
  try {
    const body = await req.json().catch(() => ({}));
    const today = new Date().toISOString().split('T')[0];
    endDate = body.endDate && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate) ? body.endDate : today;
    startDate = body.startDate && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
      ? body.startDate
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    // 最大365日制限
    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    if (diffMs > 365 * 24 * 60 * 60 * 1000) {
      startDate = new Date(new Date(endDate).getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
  } catch {
    endDate = new Date().toISOString().split('T')[0];
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  try {
    // プロパティ取得 or 作成
    let props = await sql`SELECT * FROM ga_properties WHERE user_id = ${userId} AND property_id = ${propertyId}`;
    let prop = props[0];
    if (!prop) {
      const rows = await sql`INSERT INTO ga_properties (user_id, property_id, display_name) VALUES (${userId}, ${propertyId}, 'xLUMINA Analytics') RETURNING *`;
      prop = rows[0];
    }

    // GA4 APIからデータ取得
    const [gaData, topPagesData, referralData] = await Promise.all([
      fetchGaData(propertyId, startDate, endDate),
      fetchTopPages(propertyId, startDate, endDate),
      fetchReferralSources(propertyId, startDate, endDate),
    ]);

    const rows = gaData.rows ?? [];
    const metrics = {
      sessions: 0, users: 0, newUsers: 0, pageviews: 0,
      bounceRate: 0, engagementRate: 0, avgSessionDuration: 0,
      conversions: 0, conversionRate: 0,
    };
    const channelBreakdown: Record<string, number> = {};

    rows.forEach(row => {
      const channel = row.dimensionValues?.[0]?.value ?? 'Direct';
      const sessions = parseInt(row.metricValues?.[0]?.value ?? '0');
      channelBreakdown[channel] = (channelBreakdown[channel] ?? 0) + sessions;
      metrics.sessions        += sessions;
      metrics.users           += parseInt(row.metricValues?.[1]?.value ?? '0');
      metrics.newUsers        += parseInt(row.metricValues?.[2]?.value ?? '0');
      metrics.pageviews       += parseInt(row.metricValues?.[3]?.value ?? '0');
      metrics.bounceRate       = parseFloat(row.metricValues?.[4]?.value ?? '0');
      metrics.engagementRate   = parseFloat(row.metricValues?.[5]?.value ?? '0');
      metrics.avgSessionDuration = parseFloat(row.metricValues?.[6]?.value ?? '0');
      metrics.conversions     += parseInt(row.metricValues?.[7]?.value ?? '0');
      metrics.conversionRate   = parseFloat(row.metricValues?.[8]?.value ?? '0');
    });

    const topPages = (topPagesData.rows ?? []).slice(0, 20).map(row => ({
      path: row.dimensionValues?.[0]?.value ?? '/',
      sessions: parseInt(row.metricValues?.[0]?.value ?? '0'),
    }));

    // 流入元サイト（(direct)/(none) を除外）
    const referralSources = (referralData.rows ?? [])
      .map(row => ({
        source: row.dimensionValues?.[0]?.value ?? '',
        medium: row.dimensionValues?.[1]?.value ?? '',
        sessions: parseInt(row.metricValues?.[0]?.value ?? '0'),
        bounceRate: parseFloat(row.metricValues?.[1]?.value ?? '0'),
      }))
      .filter(r => r.source !== '(direct)' && r.medium !== '(none)' && r.source !== '(not set)');

    // スナップショット保存
    const snapshots = await sql`INSERT INTO ga_snapshots
      (property_id, date_start, date_end, sessions, users, new_users, pageviews,
       bounce_rate, engagement_rate, avg_session_duration, conversions, conversion_rate,
       channel_breakdown, top_pages)
      VALUES (${prop.id}, ${startDate}, ${endDate},
        ${metrics.sessions}, ${metrics.users}, ${metrics.newUsers}, ${metrics.pageviews},
        ${metrics.bounceRate}, ${metrics.engagementRate}, ${metrics.avgSessionDuration},
        ${metrics.conversions}, ${metrics.conversionRate},
        ${JSON.stringify(channelBreakdown)}, ${JSON.stringify(topPages)})
      RETURNING id`;

    return NextResponse.json({ success: true, snapshotId: snapshots[0].id, metrics, channelBreakdown, topPages, referralSources, startDate, endDate });

  } catch (error: any) {
    console.error('[ga/fetch] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
