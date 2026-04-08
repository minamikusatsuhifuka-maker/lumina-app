import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST() {
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
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `AIを活用する上で本質的で実用的なTipsを3件、JSON配列で返してください。
以下の形式で、JSONのみ返してください（コードブロック不要）：
[
  {
    "category": "絵文字 カテゴリ名",
    "tip": "1〜2文の実践的なアドバイス",
    "detail": "3〜5文の詳細な解説と具体例",
    "tag": "初級 or 中級 or 上級 or 重要",
    "tagColor": "#4ade80 or #f5a623 or #f87171 or #a89fff"
  }
]
条件：
- すでにありがちな内容（役割付与・要約形式指定）は避ける
- 2026年時点で実際にバズっている・効果が高いと言われているテクニック
- 新人スタッフでも実践できる具体的な内容
- tagColorは tag に対応：初級=#4ade80, 中級=#f5a623, 上級=#f87171, 重要=#a89fff`
      }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '[]';

  try {
    const tips = JSON.parse(text);
    return NextResponse.json({ tips });
  } catch {
    return NextResponse.json({ error: 'パース失敗', raw: text }, { status: 500 });
  }
}
