import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { title, theme, targetReader, bookType } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!title) {
    return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 });
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
        max_tokens: 2000,
        system: `あなたはAmazon KDPのSEO・キーワード戦略の専門家です。
書籍の情報をもとに、検索で見つかりやすくなるキーワード戦略を提案してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "keywords": [
    {
      "keyword": "キーワード",
      "search_volume": "高/中/低",
      "competition": "高/中/低",
      "relevance": "高/中/低",
      "recommended": true
    }
  ],
  "top7_keywords": ["KDPに登録する7つのキーワード"],
  "categories": [
    {
      "category": "カテゴリパス",
      "reason": "選定理由"
    }
  ],
  "top2_categories": ["登録推奨の2カテゴリ"],
  "seo_tips": ["タイトル・説明文のSEOアドバイス"]
}

keywordsは15〜20個を目安に、関連するキーワードを幅広く提案してください。`,
        messages: [{
          role: 'user',
          content: `以下の書籍のキーワード戦略を提案してください。

タイトル: ${title}
テーマ: ${theme || '（タイトルから推測してください）'}
ターゲット読者: ${targetReader || '一般'}
書籍タイプ: ${bookType || 'guide'}`,
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
    return NextResponse.json({ error: `キーワード分析に失敗しました: ${msg}` }, { status: 500 });
  }
}
