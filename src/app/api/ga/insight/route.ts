import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
  }

  try {
    const { metrics, channelBreakdown, topPages } = await req.json();

    if (!metrics) {
      return NextResponse.json({ error: 'metrics が必要です' }, { status: 400 });
    }

    const pagesPerSession = metrics.sessions > 0
      ? (metrics.pageviews / metrics.sessions).toFixed(2)
      : '0';
    const newUserRate = metrics.users > 0
      ? ((metrics.newUsers / metrics.users) * 100).toFixed(1)
      : '0';
    const returningUsers = metrics.users - metrics.newUsers;

    const prompt = `あなたは皮膚科クリニック専門のWebマーケティングコンサルタントです。
以下のGA4データを分析し、**4つのセクション**に分けて回答してください。

対象サイト: 南草津皮フ科クリニック（滋賀県）のコーポレートサイト + xLUMINA経営支援プラットフォーム

## 直近7日間のGA4データ

- セッション数: ${metrics.sessions}
- アクティブユーザー: ${metrics.users}
- 新規ユーザー: ${metrics.newUsers}（新規率: ${newUserRate}%）
- リピーター: ${returningUsers}
- ページビュー: ${metrics.pageviews}
- 1セッションあたりPV: ${pagesPerSession}
- 直帰率: ${(metrics.bounceRate * 100).toFixed(1)}%
- エンゲージメント率: ${(metrics.engagementRate * 100).toFixed(1)}%
- 平均セッション時間: ${Math.round(metrics.avgSessionDuration)}秒
- コンバージョン: ${metrics.conversions}
- コンバージョン率: ${(metrics.conversionRate * 100).toFixed(2)}%

## チャネル別セッション数
${Object.entries(channelBreakdown || {}).map(([ch, count]) => `- ${ch}: ${count}`).join('\n')}

## 人気ページTOP10
${(topPages || []).map((p: { path: string; sessions: number }, i: number) => `${i + 1}. ${p.path}（${p.sessions}セッション）`).join('\n')}

## 回答フォーマット（必ずこのJSON形式で）

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
      "category": "SEO|MEO|SNS|LP改善|コンテンツ|広告|その他",
      "xluminaFeature": "xLUMINAのどの機能を使うか（該当なしなら空文字）"
    }
  ],
  "marketingIdeas": [
    {
      "channel": "SNS|SEO|MEO|LP改善|コンテンツマーケ|広告運用",
      "title": "施策タイトル",
      "description": "具体的な施策内容",
      "xluminaUsage": "xLUMINAの活用方法（例: HP内容生成でLPを作成、ABテスト生成でCTAを最適化 等）"
    }
  ]
}

### 各セクションの指示:
1. **insights**: 現状の課題と良い点を3〜5個。データに基づいた具体的な分析。
2. **actionPlans**: 5〜8個の具体的アクション。優先度を high/medium/low で分類。皮膚科クリニックに特化した内容にする。
3. **marketingIdeas**: 4〜6個のマーケティング施策。SNS・SEO・MEO・LP改善・コンテンツ等のチャネル別。
4. **xluminaFeature / xluminaUsage**: xLUMINAが持つ機能（文章作成、HP内容生成、コピー生成、ABテスト生成、ペルソナ生成、LP自動生成、画像プロンプト、ストーリーテリング、ディープリサーチ、Web情報収集、経営インテリジェンス、業界レポート）を活用する提案を必ず含める。`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = result.response.text();

    // JSONブロックを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        summary: 'AI分析が完了しました。',
        insights: [{ title: '分析完了', body: text, type: 'info' as const }],
        actionPlans: [],
        marketingIdeas: [],
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 必須フィールドが欠けている場合のフォールバック
    return NextResponse.json({
      summary: parsed.summary || '',
      insights: parsed.insights || [],
      actionPlans: parsed.actionPlans || [],
      marketingIdeas: parsed.marketingIdeas || [],
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[ga/insight] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
