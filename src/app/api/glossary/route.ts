import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { word } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーなし' }, { status: 500 });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `「${word}」という用語について、最新のWeb情報を検索して以下のJSON形式で解説してください。
JSONのみ返してください（コードブロック不要）：

{
  "word": "用語名（正式名称）",
  "reading": "読み仮名（ひらがな）",
  "category": "AI基礎 or AI応用 or ビジネス or 技術用語 or ツール or その他",
  "simple": "中学生でもわかる1〜2文の簡単な説明",
  "detail": "3〜5文の詳しい説明。最新情報があれば含める",
  "example": "具体的な使用例や実例",
  "analogy": "絵文字付きのたとえ話（身近なものに例える）",
  "fullName": "略語の場合は正式名称（英語）、略語でない場合は空文字"
}

条件：
- 必ず最新のWeb情報を検索して正確な情報を含める
- 中学生でもわかる言葉で書く（専門用語は避ける）
- たとえ話は日常生活の身近なものに例える
- 2026年時点の最新情報を反映する`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  try {
    const term = JSON.parse(text);
    return NextResponse.json({ term });
  } catch {
    return NextResponse.json({ error: 'パース失敗', raw: text }, { status: 500 });
  }
}
