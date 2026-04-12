import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { theme, bookType } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!theme) {
    return NextResponse.json({ error: 'テーマは必須です' }, { status: 400 });
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
        max_tokens: 4000,
        system: `あなたはKindle出版の企画プロデューサーです。
与えられたテーマと書籍タイプをもとに、Amazon KDPで売れる本のアイデアを10個提案してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "ideas": [
    {
      "rank": 1,
      "title": "書籍タイトル",
      "subtitle": "サブタイトル",
      "target": "ターゲット読者",
      "unique_value": "この本ならではの価値",
      "estimated_price": "想定価格（例: 498円）",
      "difficulty": "執筆難易度（低/中/高）",
      "market_size": "市場規模（小/中/大）",
      "competition": "競合度（低/中/高）",
      "score": 85,
      "reason": "このスコアの理由"
    }
  ],
  "top_recommendation": "10個の中で最もおすすめの1冊とその理由（200字程度）"
}

scoreは0〜100の整数で、市場性・独自性・執筆しやすさを総合評価してください。
rankはscoreの高い順に1から振ってください。`,
        messages: [{
          role: 'user',
          content: `以下の条件で本のアイデアを10個出してください。

テーマ: ${theme}
書籍タイプ: ${bookType || '指定なし（最適なタイプを提案してください）'}`,
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
    return NextResponse.json({ error: `ブレストの生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
