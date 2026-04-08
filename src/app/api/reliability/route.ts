import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { content, urls } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: 'あなたは情報の信頼性評価の専門家です。JSONのみ返してください。',
      messages: [{
        role: 'user',
        content: `以下の情報の信頼性を評価してください。

【情報の概要】
${content.slice(0, 1000)}

【引用URL数】
${urls?.length || 0}件

以下のJSONのみ返してください：
{
  "score": 0-100の数値,
  "level": "高" or "中" or "低",
  "reasons": ["理由1", "理由2", "理由3"],
  "warnings": ["注意点1", "注意点2"]
}

評価基準：
- 複数の出典URL（5件以上で+20点）
- 具体的な数字・データの引用（+15点）
- 有名メディア・公式サイトからの引用（+20点）
- 情報の新鮮さ（2026年の情報で+10点）
- 偏った見解のみ（-20点）
- 出典なし（-30点）`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json({ score: 50, level: '中', reasons: ['評価完了'], warnings: [] });
  }
}
