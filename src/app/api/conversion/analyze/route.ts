import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchConversionData } from '@/lib/conversion-fetch';

export const runtime = 'nodejs';
export const maxDuration = 120;

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

    // GA4 からページ別メトリクスを取得し自費診療カテゴリ毎に集約（lib化、挙動不変）
    const byCategory = await fetchConversionData(propertyId, startDate, endDate);

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
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
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
