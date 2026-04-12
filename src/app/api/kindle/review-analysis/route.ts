import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { bookTitle, reviews } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!reviews || (Array.isArray(reviews) && reviews.length === 0)) {
    return NextResponse.json({ error: 'レビューデータは必須です' }, { status: 400 });
  }

  try {
    const reviewsText = Array.isArray(reviews)
      ? reviews.map((r: string, i: number) => `レビュー${i + 1}: ${r}`).join('\n\n')
      : reviews;

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
        system: `あなたは書籍マーケティングのデータアナリストです。
読者レビューを分析し、改善点と次回作への示唆を導き出してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "sentiment_summary": "レビュー全体の感情傾向の要約（200字程度）",
  "strengths": [
    {
      "point": "評価されている点",
      "frequency": "言及頻度（多い/普通/少ない）",
      "example_quote": "該当レビューからの引用"
    }
  ],
  "weaknesses": [
    {
      "point": "批判されている点",
      "frequency": "言及頻度（多い/普通/少ない）",
      "example_quote": "該当レビューからの引用"
    }
  ],
  "improvement_suggestions": [
    {
      "area": "改善領域",
      "suggestion": "具体的な改善案",
      "priority": "高/中/低"
    }
  ],
  "next_book_ideas": [
    {
      "idea": "次回作のアイデア",
      "reason": "このアイデアの根拠（レビューのどの声から）"
    }
  ],
  "response_templates": [
    {
      "review_type": "肯定的/否定的/質問/要望",
      "response": "著者としての返信テンプレート"
    }
  ]
}`,
        messages: [{
          role: 'user',
          content: `以下の書籍レビューを分析してください。

書籍タイトル: ${bookTitle || '（不明）'}

--- レビュー一覧 ---
${reviewsText}
--- ここまで ---`,
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
    return NextResponse.json({ error: `レビュー分析に失敗しました: ${msg}` }, { status: 500 });
  }
}
