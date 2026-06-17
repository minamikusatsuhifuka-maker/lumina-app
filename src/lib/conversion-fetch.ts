import { BetaAnalyticsDataClient } from '@google-analytics/data';

// 自費診療ページのURLパターン（部分一致）
// conversion/analyze/route.ts から移設。route・cron 双方から参照する。
export const JIHI_PAGES: { key: string; label: string }[] = [
  { key: 'isotretinoin', label: 'イソトレチノイン' },
  { key: 'miin_laser', label: 'ミーンレーザー' },
  { key: 'whitening', label: '美白治療' },
  { key: 'melasma', label: 'シミ・肝斑治療' },
  { key: 'dermapen', label: 'ダーマペン' },
  { key: 'peeling', label: 'ケミカルピーリング' },
  { key: 'botox', label: 'ボトックス注射' },
  { key: 'hifu', label: 'HIFU' },
  { key: 'pigment', label: '色素沈着治療' },
  { key: 'hair_removal', label: '医療脱毛' },
  { key: 'dupilumab', label: 'デュピクセント' },
];

export interface ConversionCategory {
  key: string;
  label: string;
  sessions: number;
  pageviews: number;
  conversions: number;
  bounceRate: number;
  avgSessionDuration: number;
  cvr: number;
  paths: string[];
}

function getGaClient() {
  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL!;
  let key = process.env.GA4_PRIVATE_KEY!;
  key = key.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');
  return new BetaAnalyticsDataClient({
    credentials: { client_email: email, private_key: key },
  });
}

// GA4 からページ別メトリクスを取得し、自費診療カテゴリ毎に集約する。
// conversion/analyze/route.ts のベタ書き取得をそのまま抽出（挙動不変）。
export async function fetchConversionData(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<ConversionCategory[]> {
  const client = getGaClient();
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'sessions' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'screenPageViews' },
      { name: 'conversions' },
    ],
    dimensions: [{ name: 'pagePath' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 200,
  });

  const allPages = (response.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? '/',
    sessions: parseInt(r.metricValues?.[0]?.value ?? '0'),
    bounceRate: parseFloat(r.metricValues?.[1]?.value ?? '0'),
    avgSessionDuration: parseFloat(r.metricValues?.[2]?.value ?? '0'),
    pageviews: parseInt(r.metricValues?.[3]?.value ?? '0'),
    conversions: parseInt(r.metricValues?.[4]?.value ?? '0'),
  }));

  // 自費診療ページを抽出・カテゴリ毎に集約
  return JIHI_PAGES.map((cat) => {
    const matched = allPages.filter((p) => p.path.toLowerCase().includes(cat.key));
    const sessions = matched.reduce((s, p) => s + p.sessions, 0);
    const pageviews = matched.reduce((s, p) => s + p.pageviews, 0);
    const conversions = matched.reduce((s, p) => s + p.conversions, 0);
    const weightedBounce =
      sessions > 0
        ? matched.reduce((s, p) => s + p.bounceRate * p.sessions, 0) / sessions
        : 0;
    const weightedDuration =
      sessions > 0
        ? matched.reduce((s, p) => s + p.avgSessionDuration * p.sessions, 0) / sessions
        : 0;
    const cvr = sessions > 0 ? conversions / sessions : 0;
    return {
      key: cat.key,
      label: cat.label,
      sessions,
      pageviews,
      conversions,
      bounceRate: weightedBounce,
      avgSessionDuration: weightedDuration,
      cvr,
      paths: matched.map((m) => m.path).slice(0, 5),
    };
  }).filter((c) => c.sessions > 0);
}
