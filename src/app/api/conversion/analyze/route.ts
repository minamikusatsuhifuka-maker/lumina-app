import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 自費診療ページのURLパターン（部分一致）
const JIHI_PAGES: { key: string; label: string }[] = [
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

function getGaClient() {
  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL!;
  let key = process.env.GA4_PRIVATE_KEY!;
  key = key.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');
  return new BetaAnalyticsDataClient({
    credentials: { client_email: email, private_key: key },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    return NextResponse.json({ error: 'GA4_PROPERTY_ID が設定されていません' }, { status: 500 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const today = new Date().toISOString().split('T')[0];
    const endDate: string =
      body.endDate && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate) ? body.endDate : today;
    const startDate: string =
      body.startDate && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
        ? body.startDate
        : new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // GA4 からページ別メトリクスを取得
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
    const byCategory = JIHI_PAGES.map((cat) => {
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

    // AIによるCVR改善提案
    const apiKey = process.env.GEMINI_API_KEY;
    let aiResult: {
      summary: string;
      improvements: {
        pageKey: string;
        title: string;
        description: string;
        priority: 'high' | 'medium' | 'low';
      }[];
    } = { summary: '', improvements: [] };

    if (apiKey && byCategory.length > 0) {
      const prompt = `あなたは皮膚科クリニックのWebマーケティングコンサルタントです。
以下の自費診療ページのGA4データを分析し、CVR改善提案を日本語で作成してください。

## 対象期間
${startDate} 〜 ${endDate}

## 自費診療ページ別パフォーマンス
${byCategory
  .map(
    (c, i) =>
      `${i + 1}. ${c.label} (${c.key})
   セッション: ${c.sessions.toLocaleString()} / 直帰率: ${(c.bounceRate * 100).toFixed(1)}% / 平均滞在: ${Math.round(c.avgSessionDuration)}秒 / CV: ${c.conversions} / CVR: ${(c.cvr * 100).toFixed(2)}%`,
  )
  .join('\n')}

## 回答フォーマット（必ずこのJSON形式）
{
  "summary": "全体サマリー（2〜3文、どのページが優先課題か）",
  "improvements": [
    {
      "pageKey": "対象ページのkey（上記のkey名）",
      "title": "改善施策タイトル",
      "description": "具体的な実施内容（2〜4文）",
      "priority": "high|medium|low"
    }
  ]
}

指示:
- improvements は 5〜8 個
- 直帰率が高い・滞在時間が短い・CVRが低いページを優先
- 皮膚科自費診療の実務に即した具体策（FAQ追加、価格表透明化、Before/After、LP改善、予約導線、LINE誘導等）`;

      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          aiResult = {
            summary: parsed.summary || '',
            improvements: parsed.improvements || [],
          };
        }
      } catch (e) {
        console.warn('[conversion/analyze] AI failed:', e);
      }
    }

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      categories: byCategory,
      ai: aiResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[conversion/analyze] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
