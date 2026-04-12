import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { content, bookType, chapterTitle } = await req.json();
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
        max_tokens: 3000,
        system: `あなたはプロの書籍編集者です。
与えられた原稿を分析し、品質を評価してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "readability_score": 78,
  "overall_rating": "B",
  "issues": [
    {
      "type": "誤字脱字/文法/構成/表現/冗長/一貫性",
      "location": "該当箇所の引用（20文字以内）",
      "severity": "高/中/低",
      "suggestion": "修正案・改善案"
    }
  ],
  "strengths": ["良い点1", "良い点2"],
  "next_steps": ["次にやるべき改善ステップ"]
}

readability_scoreは0〜100の整数で、読みやすさを評価してください。
overall_ratingはS（傑出）/A（優秀）/B（良好）/C（要改善）/D（大幅修正必要）の5段階です。
issuesは重要度順に並べてください。`,
        messages: [{
          role: 'user',
          content: `以下の原稿を編集者として分析してください。

章タイトル: ${chapterTitle || '（指定なし）'}
書籍タイプ: ${bookType || 'guide'}

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
    return NextResponse.json({ error: `編集分析に失敗しました: ${msg}` }, { status: 500 });
  }
}
