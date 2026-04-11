import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { url, title, content, source } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

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
        max_tokens: 1000,
        system: `あなたは情報の信頼性を評価する専門アナリストです。
与えられた情報源を分析し、以下のJSON形式で信頼性スコアを返してください。
必ず有効なJSONのみを返してください。前置きや説明は不要です。

{
  "total_score": 0〜100の整数,
  "grade": "S" | "A" | "B" | "C" | "D",
  "badges": ["信頼性に関するバッジ文字列の配列"],
  "breakdown": {
    "domain_authority": 0〜100の整数（ドメイン権威性）,
    "content_quality": 0〜100の整数（コンテンツ品質）,
    "recency": 0〜100の整数（情報の新しさ）,
    "source_type": 0〜100の整数（情報源の種類による信頼性）
  },
  "warnings": ["注意点の配列"],
  "recommendation": "総合的な推奨コメント"
}

グレード基準: S=90以上, A=75以上, B=55以上, C=35以上, D=35未満`,
        messages: [{
          role: 'user',
          content: `以下の情報源を評価してください。

URL: ${url || '(なし)'}
タイトル: ${title || '(なし)'}
内容: ${content || '(なし)'}
情報源種別: ${source || '(なし)'}`,
        }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '{}';

    // JSONパース
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI応答のパースに失敗しました' }, { status: 500 });
    }
    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `信頼性評価に失敗しました: ${msg}` }, { status: 500 });
  }
}
