import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { content, bookTitle, targetReader } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!content) {
    return NextResponse.json({ error: '本文は必須です' }, { status: 400 });
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
        system: `あなたは3人の異なる読者ペルソナになりきって、書籍原稿にフィードバックを与えてください。
ターゲット読者層に合わせたリアルなペルソナを設定し、それぞれの視点から率直にレビューしてください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "reviews": [
    {
      "persona_name": "ペルソナの名前",
      "age": 35,
      "occupation": "職業",
      "rating": 4,
      "liked": ["気に入った点1", "気に入った点2"],
      "disliked": ["不満点1", "不満点2"],
      "quote": "この本を一言で表すと「○○」",
      "improvement": "最も改善してほしいこと"
    }
  ],
  "overall_prediction": "この本の市場での反応予測（200字程度）",
  "improvement_priority": [
    {
      "priority": 1,
      "area": "改善領域",
      "action": "具体的なアクション",
      "impact": "高/中/低"
    }
  ]
}

ratingは1〜5の整数（5が最高）です。
3人のペルソナは年齢・職業・読書経験が異なるように設定してください。`,
        messages: [{
          role: 'user',
          content: `以下の原稿に3人の読者ペルソナとしてフィードバックをください。

書籍タイトル: ${bookTitle || '（未定）'}
ターゲット読者: ${targetReader || '一般'}

--- 原稿ここから ---
${content}
--- 原稿ここまで ---`,
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
    return NextResponse.json({ error: `フィードバック生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
