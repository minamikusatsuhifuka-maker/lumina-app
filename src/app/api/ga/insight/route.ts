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

    const prompt = `あなたはWebサイトのアクセス解析の専門家です。以下のGA4データを分析し、日本語でインサイトを3〜5点にまとめてください。
各ポイントは具体的なアクション提案を含めてください。

## 直近7日間のGA4データ

- セッション数: ${metrics.sessions}
- アクティブユーザー: ${metrics.users}
- 新規ユーザー: ${metrics.newUsers}
- ページビュー: ${metrics.pageviews}
- 直帰率: ${(metrics.bounceRate * 100).toFixed(1)}%
- エンゲージメント率: ${(metrics.engagementRate * 100).toFixed(1)}%
- 平均セッション時間: ${Math.round(metrics.avgSessionDuration)}秒
- コンバージョン: ${metrics.conversions}
- コンバージョン率: ${(metrics.conversionRate * 100).toFixed(2)}%

## チャネル別セッション数
${Object.entries(channelBreakdown || {}).map(([ch, count]) => `- ${ch}: ${count}`).join('\n')}

## 人気ページTOP10
${(topPages || []).map((p: { path: string; sessions: number }, i: number) => `${i + 1}. ${p.path}（${p.sessions}セッション）`).join('\n')}

以下のJSON形式で回答してください:
{
  "insights": [
    { "title": "タイトル", "body": "説明とアクション提案", "type": "positive|warning|info" }
  ],
  "summary": "全体サマリー（1〜2文）"
}`;

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
        insights: [{ title: '分析完了', body: text, type: 'info' as const }],
        summary: 'AI分析が完了しました。',
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[ga/insight] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
