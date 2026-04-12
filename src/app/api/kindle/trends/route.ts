import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { category } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!category) {
    return NextResponse.json({ error: 'カテゴリは必須です' }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: `あなたはKindle出版の市場トレンドアナリストです。
指定されたカテゴリの最新トレンドを分析し、出版チャンスを提案してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "hot_themes": [
    {
      "theme": "注目テーマ名",
      "trend_score": 85,
      "reason": "なぜ今注目されているか",
      "book_type": "おすすめ書籍タイプ",
      "example_title": "タイトル案",
      "urgency": "高/中/低"
    }
  ],
  "declining_themes": [
    {
      "theme": "下降トレンドのテーマ",
      "reason": "なぜ下がっているか",
      "avoid_reason": "避けるべき理由"
    }
  ],
  "niche_opportunities": [
    {
      "niche": "ニッチ市場名",
      "potential": "高/中/低",
      "reason": "チャンスの理由",
      "suggested_title": "タイトル案",
      "target_reader": "ターゲット読者"
    }
  ]
}

hot_themesは5〜8個、declining_themesは3〜5個、niche_opportunitiesは3〜5個を目安にしてください。
trend_scoreは0〜100の整数です。`,
        messages: [{
          role: 'user',
          content: `以下のカテゴリのKindle出版トレンドを分析してください。

カテゴリ: ${category}`,
        }],
      }),
    });

    const data = await response.json();
    let text = data.content?.[0]?.text ?? '{}';
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) text = text.slice(jsonStart, jsonEnd + 1);
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ error: 'JSONパース失敗', raw: text.slice(0, 100) }, { status: 500 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `トレンド分析に失敗しました: ${msg}` }, { status: 500 });
  }
}
