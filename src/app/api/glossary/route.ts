import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

async function callAnthropic(apiKey: string, body: object, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status === 529) && i < retries) {
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
}

export async function POST(req: NextRequest) {
  const { word } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーなし' }, { status: 500 });

  try {
    const data = await callAnthropic(apiKey, {
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `「${word}」という用語について、以下のJSON形式で解説してください。
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
- 中学生でもわかる言葉で書く（専門用語は避ける）
- たとえ話は日常生活の身近なものに例える
- 2026年時点の最新情報を反映する`,
      }],
    });

    let text = (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    // マークダウンコードブロックを除去
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const term = JSON.parse(text);
    return NextResponse.json({ term });
  } catch (e: any) {
    console.error('[glossary]', e.message);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
