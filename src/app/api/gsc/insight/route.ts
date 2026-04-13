import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface QueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}
interface PageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY が設定されていません' },
      { status: 500 },
    );
  }

  try {
    const { totals, queries, pages } = await req.json();
    if (!totals || !queries || !pages) {
      return NextResponse.json({ error: 'データが不足しています' }, { status: 400 });
    }

    const topQueries = (queries as QueryRow[]).slice(0, 20);
    const topPages = (pages as PageRow[]).slice(0, 10);

    const prompt = `あなたは皮膚科クリニック専門のSEOコンサルタントです。
以下のGoogle Search Consoleデータを分析し、改善提案をJSON形式で返してください。

対象サイト: 南草津皮フ科クリニック（滋賀県） + xLUMINA (https://xlumina.jp/)

## 全体サマリー
- 総クリック数: ${totals.clicks}
- 総表示回数: ${totals.impressions}
- 平均CTR: ${(totals.ctr * 100).toFixed(2)}%
- 平均順位: ${totals.position.toFixed(1)}

## 検索キーワードTOP20（クリック/表示/CTR/順位）
${topQueries
  .map(
    (q, i) =>
      `${i + 1}. "${q.query}" - ${q.clicks}クリック / ${q.impressions}表示 / CTR ${(
        q.ctr * 100
      ).toFixed(2)}% / 順位 ${q.position.toFixed(1)}`,
  )
  .join('\n')}

## 人気ページTOP10
${topPages
  .map(
    (p, i) =>
      `${i + 1}. ${p.page} - ${p.clicks}クリック / ${p.impressions}表示 / 順位 ${p.position.toFixed(
        1,
      )}`,
  )
  .join('\n')}

## 回答フォーマット（必ずこのJSON形式で、余計な文字なし）
{
  "summary": "全体サマリー（2〜3文）",
  "insights": [
    { "title": "タイトル", "body": "説明", "type": "positive|warning|info" }
  ],
  "actionPlans": [
    {
      "title": "アクション名",
      "description": "具体的な実施内容",
      "priority": "high|medium|low",
      "category": "SEO|コンテンツ|技術SEO|内部リンク|その他"
    }
  ],
  "keywordOpportunities": [
    {
      "query": "キーワード",
      "reason": "狙うべき理由（例: 順位11〜20位で表示多・CTR低）",
      "action": "具体的な改善アクション"
    }
  ]
}

### 指示
1. insights: 3〜5個。データに基づいた具体的な分析（CTR低迷、順位11位以下の惜しいキーワード、ロングテール機会など）。
2. actionPlans: 5〜8個。皮膚科クリニック向けSEO施策。
3. keywordOpportunities: 順位11〜20位かつ表示回数が多いキーワードを中心に4〜6個ピックアップ。`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        summary: 'AI分析が完了しました。',
        insights: [{ title: '分析完了', body: text, type: 'info' as const }],
        actionPlans: [],
        keywordOpportunities: [],
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      summary: parsed.summary || '',
      insights: parsed.insights || [],
      actionPlans: parsed.actionPlans || [],
      keywordOpportunities: parsed.keywordOpportunities || [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[gsc/insight] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
