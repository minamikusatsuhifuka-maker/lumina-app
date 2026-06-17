import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { fetchGaData } from '@/lib/ga-client';
import { fetchConversionData } from '@/lib/conversion-fetch';
import { fetchSearchConsoleData, GSC_SITE_URL } from '@/lib/gsc-client';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 収益指標（GA / CV / SEO）の日次スナップショット + 前日比のアプリ内通知。
// Vercel Cron から JST 朝7時（UTC 前日22:00）に呼ばれる。
// 各取得は個別 try/catch（1つ失敗しても他を続行）。

// CV/SEO 専用テーブルを冪等に用意（GA は既存 ga_snapshots / ga_metric_history を流用）
async function ensureTables(sql: ReturnType<typeof neon<false, false>>) {
  await sql`CREATE TABLE IF NOT EXISTS cv_snapshots (
    id SERIAL PRIMARY KEY, date DATE NOT NULL, category_key TEXT, label TEXT,
    sessions INT, pageviews INT, conversions INT,
    bounce_rate NUMERIC, avg_session_duration NUMERIC, cvr NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(date, category_key)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS seo_snapshots (
    id SERIAL PRIMARY KEY, date DATE NOT NULL,
    clicks INT, impressions INT, ctr NUMERIC, position NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(date)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS seo_query_snapshots (
    id SERIAL PRIMARY KEY, date DATE NOT NULL, query TEXT,
    clicks INT, impressions INT, ctr NUMERIC, position NUMERIC,
    UNIQUE(date, query)
  )`;
}

// 増減を「+3 / -5%」のような文言に整形
function fmtDelta(today: number, prev: number | null, opts?: { pct?: boolean; digits?: number }): string {
  if (prev === null) return '初回取得';
  const diff = today - prev;
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '±';
  const abs = Math.abs(diff);
  if (opts?.pct && prev !== 0) {
    const rate = (diff / prev) * 100;
    const s = rate > 0 ? '+' : rate < 0 ? '-' : '±';
    return `${s}${Math.abs(rate).toFixed(opts.digits ?? 0)}%`;
  }
  return `${sign}${abs.toFixed(opts?.digits ?? 0)}`;
}

export async function GET(req: NextRequest) {
  // 1. 認証: Bearer CRON_SECRET（既存 cron と同じ作法）
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // 対象日 = 前日（JST）。cron は UTC 22:00 = JST 翌07:00 のため、now-15h の日付が JST 前日。
  const targetDate = new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString().split('T')[0];

  const result: Record<string, unknown> = { date: targetDate };
  const summaryParts: string[] = [];

  try {
    await ensureTables(sql);
  } catch (e) {
    console.error('[cron/ga-cv-seo] ensureTables failed', e);
  }

  // 通知先（院長）userId を解決: GA プロパティ所有者 → なければ最古ユーザー
  let ownerUserId: string | null = null;
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    const propRows = propertyId
      ? await sql`SELECT user_id FROM ga_properties WHERE property_id = ${propertyId} ORDER BY created_at ASC LIMIT 1`
      : [];
    if (propRows.length > 0) {
      ownerUserId = propRows[0].user_id as string;
    } else {
      const users = await sql`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`;
      ownerUserId = users[0]?.id ?? null;
    }
  } catch (e) {
    console.error('[cron/ga-cv-seo] resolve owner failed', e);
  }

  // ── 2. GA: fetchGaData(前日) → ga_snapshots + ga_metric_history ──
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) throw new Error('GA4_PROPERTY_ID 未設定');

    // ga_properties 行を取得 or 作成（cron からも保存先を確保）
    let propRows = await sql`SELECT * FROM ga_properties WHERE property_id = ${propertyId} ORDER BY created_at ASC LIMIT 1`;
    let prop = propRows[0];
    if (!prop && ownerUserId) {
      const created = await sql`INSERT INTO ga_properties (user_id, property_id, display_name)
        VALUES (${ownerUserId}, ${propertyId}, 'xLUMINA Analytics') RETURNING *`;
      prop = created[0];
    }
    if (!prop) throw new Error('ga_properties が解決できません');

    const gaData = await fetchGaData(propertyId, targetDate, targetDate);
    const rows = gaData.rows ?? [];
    const metrics = {
      sessions: 0, users: 0, newUsers: 0, pageviews: 0,
      bounceRate: 0, engagementRate: 0, avgSessionDuration: 0,
      conversions: 0, conversionRate: 0,
    };
    const channelBreakdown: Record<string, number> = {};
    // ga/fetch の集約をそのまま踏襲（bounce 等は最終行上書きの癖も維持）
    rows.forEach((row) => {
      const channel = row.dimensionValues?.[0]?.value ?? 'Direct';
      const sessions = parseInt(row.metricValues?.[0]?.value ?? '0');
      channelBreakdown[channel] = (channelBreakdown[channel] ?? 0) + sessions;
      metrics.sessions += sessions;
      metrics.users += parseInt(row.metricValues?.[1]?.value ?? '0');
      metrics.newUsers += parseInt(row.metricValues?.[2]?.value ?? '0');
      metrics.pageviews += parseInt(row.metricValues?.[3]?.value ?? '0');
      metrics.bounceRate = parseFloat(row.metricValues?.[4]?.value ?? '0');
      metrics.engagementRate = parseFloat(row.metricValues?.[5]?.value ?? '0');
      metrics.avgSessionDuration = parseFloat(row.metricValues?.[6]?.value ?? '0');
      metrics.conversions += parseInt(row.metricValues?.[7]?.value ?? '0');
      metrics.conversionRate = parseFloat(row.metricValues?.[8]?.value ?? '0');
    });

    // 同日の既存スナップショット（cron二重実行）は作り直し
    await sql`DELETE FROM ga_snapshots WHERE property_id = ${prop.id} AND date_start = ${targetDate} AND date_end = ${targetDate}`;
    const snap = await sql`INSERT INTO ga_snapshots
      (property_id, date_start, date_end, sessions, users, new_users, pageviews,
       bounce_rate, engagement_rate, avg_session_duration, conversions, conversion_rate,
       channel_breakdown, top_pages)
      VALUES (${prop.id}, ${targetDate}, ${targetDate},
        ${metrics.sessions}, ${metrics.users}, ${metrics.newUsers}, ${metrics.pageviews},
        ${metrics.bounceRate}, ${metrics.engagementRate}, ${metrics.avgSessionDuration},
        ${metrics.conversions}, ${metrics.conversionRate},
        ${JSON.stringify(channelBreakdown)}, ${JSON.stringify([])})
      RETURNING id`;
    const snapshotId = snap[0].id as string;

    // 指標×日付の時系列（ga_metric_history、同 snapshot は入れ直し）
    const mh: [string, number][] = [
      ['sessions', metrics.sessions],
      ['users', metrics.users],
      ['new_users', metrics.newUsers],
      ['pageviews', metrics.pageviews],
      ['bounce_rate', metrics.bounceRate],
      ['engagement_rate', metrics.engagementRate],
      ['avg_session_duration', metrics.avgSessionDuration],
      ['conversions', metrics.conversions],
      ['conversion_rate', metrics.conversionRate],
    ];
    for (const [name, value] of mh) {
      await sql`INSERT INTO ga_metric_history (snapshot_id, metric_name, value, date)
        VALUES (${snapshotId}, ${name}, ${value}, ${targetDate})`;
    }

    // 前日比（同プロパティで直近2日）
    const gaHist = await sql`SELECT date_start, sessions FROM ga_snapshots
      WHERE property_id = ${prop.id} AND date_start <= ${targetDate}
      ORDER BY date_start DESC LIMIT 2`;
    const prevSessions = gaHist.length > 1 ? Number(gaHist[1].sessions) : null;
    summaryParts.push(`セッション ${metrics.sessions}（${fmtDelta(metrics.sessions, prevSessions, { pct: true })}）`);
    result.ga = { sessions: metrics.sessions, conversions: metrics.conversions };
  } catch (e) {
    console.error('[cron/ga-cv-seo] GA failed', e);
    result.ga = { error: e instanceof Error ? e.message : String(e) };
  }

  // ── 3. CV: conversion-fetch(前日) → cv_snapshots UPSERT ──
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) throw new Error('GA4_PROPERTY_ID 未設定');
    const categories = await fetchConversionData(propertyId, targetDate, targetDate);
    for (const c of categories) {
      await sql`INSERT INTO cv_snapshots
        (date, category_key, label, sessions, pageviews, conversions, bounce_rate, avg_session_duration, cvr)
        VALUES (${targetDate}, ${c.key}, ${c.label}, ${c.sessions}, ${c.pageviews}, ${c.conversions},
          ${c.bounceRate}, ${c.avgSessionDuration}, ${c.cvr})
        ON CONFLICT (date, category_key) DO UPDATE SET
          label = EXCLUDED.label, sessions = EXCLUDED.sessions, pageviews = EXCLUDED.pageviews,
          conversions = EXCLUDED.conversions, bounce_rate = EXCLUDED.bounce_rate,
          avg_session_duration = EXCLUDED.avg_session_duration, cvr = EXCLUDED.cvr`;
    }
    const cvToday = categories.reduce((s, c) => s + c.conversions, 0);
    // 前日比（前日合計 CV）
    const prevRows = await sql`SELECT COALESCE(SUM(conversions),0) AS cv FROM cv_snapshots
      WHERE date = (SELECT MAX(date) FROM cv_snapshots WHERE date < ${targetDate})`;
    const prevHasData = await sql`SELECT 1 FROM cv_snapshots WHERE date < ${targetDate} LIMIT 1`;
    const prevCv = prevHasData.length > 0 ? Number(prevRows[0].cv) : null;
    summaryParts.push(`CV ${cvToday}件（${fmtDelta(cvToday, prevCv)}）`);
    result.cv = { conversions: cvToday, categories: categories.length };
  } catch (e) {
    console.error('[cron/ga-cv-seo] CV failed', e);
    result.cv = { error: e instanceof Error ? e.message : String(e) };
  }

  // ── 4. SEO: fetchSearchConsoleData(前日) → seo_snapshots / seo_query_snapshots UPSERT ──
  try {
    const data = await fetchSearchConsoleData(GSC_SITE_URL, targetDate, targetDate);
    let totalClicks = 0, totalImpressions = 0, posSum = 0, posCount = 0;
    for (const r of data.queries) {
      totalClicks += r.clicks;
      totalImpressions += r.impressions;
      posSum += r.position;
      posCount++;
    }
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const avgPosition = posCount > 0 ? posSum / posCount : 0;

    await sql`INSERT INTO seo_snapshots (date, clicks, impressions, ctr, position)
      VALUES (${targetDate}, ${totalClicks}, ${totalImpressions}, ${avgCtr}, ${avgPosition})
      ON CONFLICT (date) DO UPDATE SET
        clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions,
        ctr = EXCLUDED.ctr, position = EXCLUDED.position`;

    for (const r of data.queries) {
      const query = r.keys?.[0] ?? '';
      if (!query) continue;
      await sql`INSERT INTO seo_query_snapshots (date, query, clicks, impressions, ctr, position)
        VALUES (${targetDate}, ${query}, ${r.clicks}, ${r.impressions}, ${r.ctr}, ${r.position})
        ON CONFLICT (date, query) DO UPDATE SET
          clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions,
          ctr = EXCLUDED.ctr, position = EXCLUDED.position`;
    }

    // 前日比（クリック数）
    const seoHist = await sql`SELECT clicks FROM seo_snapshots
      WHERE date <= ${targetDate} ORDER BY date DESC LIMIT 2`;
    const prevClicks = seoHist.length > 1 ? Number(seoHist[1].clicks) : null;
    summaryParts.push(`検索クリック ${totalClicks}（${fmtDelta(totalClicks, prevClicks)}）`);
    result.seo = { clicks: totalClicks, queries: data.queries.length };
  } catch (e) {
    console.error('[cron/ga-cv-seo] SEO failed', e);
    result.seo = { error: e instanceof Error ? e.message : String(e) };
  }

  // ── 5. 前日比サマリをアプリ内通知（fire-and-forget）──
  if (ownerUserId && summaryParts.length > 0) {
    await notify({
      userId: ownerUserId,
      title: '📊 本日のアクセス指標',
      message: `${targetDate} 分: ${summaryParts.join(' / ')}`,
      href: '/dashboard/analytics',
      type: 'info',
    });
  }

  return NextResponse.json({ success: true, ...result, summary: summaryParts.join(' / ') });
}

// 手動テスト用（GET と同じ処理）
export async function POST(req: NextRequest) {
  return GET(req);
}
