import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const maxDuration = 60;

// リサーチ結果から専門用語を抽出するAPI（Claude Sonnet 4.6）
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY未設定' }, { status: 500 });

  try {
    const { researchText, topic } = await req.json();
    if (!researchText) {
      return NextResponse.json({ error: 'researchTextが必要です' }, { status: 400 });
    }

    const prompt = `以下のリサーチ結果から、日常会話ではほとんど使われない専門用語・難解な概念を抽出してください。

【条件】
- 一般的な日本語話者が知らない可能性が高い用語
- 業界・学術・ビジネス固有の概念
- 略語・外来語・カタカナ専門語
- 最大15件まで

【リサーチトピック】${topic ?? ''}

【リサーチ結果】
${String(researchText).slice(0, 3000)}

以下のJSON形式のみで回答してください（前後の説明・コードブロック不要）:
{
  "terms": [
    {
      "term": "用語名",
      "reading": "よみがな（カタカナ・英語はそのまま）",
      "category": "ビジネス|心理学|医療|IT|経済|法律|哲学|その他",
      "difficulty": "やや難|難|超難",
      "context": "本文中でどのように使われていたか（20字以内）"
    }
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        temperature: 0.5,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[glossary/research-extract] Anthropicエラー:', response.status, err);
      return NextResponse.json({ error: `Anthropic ${response.status}`, terms: [] }, { status: 500 });
    }

    const data = await response.json();
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const text = blocks
      .filter((b: any) => b?.type === 'text' && typeof b?.text === 'string')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    const cleaned = text.replace(/```(?:json)?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[glossary/research-extract] JSON抽出失敗:', cleaned.slice(0, 300));
      return NextResponse.json({ terms: [], error: 'JSON抽出失敗' }, { status: 500 });
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json({ terms: parsed.terms ?? [] });
    } catch (e: any) {
      return NextResponse.json({ terms: [], error: 'JSONパース失敗' }, { status: 500 });
    }
  } catch (e: any) {
    console.error('[glossary/research-extract] エラー:', e);
    return NextResponse.json({ error: e?.message || 'エラー', terms: [] }, { status: 500 });
  }
}
