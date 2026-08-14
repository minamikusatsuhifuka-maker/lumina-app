import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createAnthropicClient } from '@/lib/anthropic-compat';
import { extractAnthropicText } from '@/lib/anthropic-text';
import { robustJsonParse } from '@/lib/ai-json-parser';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY未設定' }, { status: 500 });

  const { text } = await req.json();
  if (!text || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 });
  }

  const client = createAnthropicClient();

  try {
    const response = await client.messages.create({
      model: CLAUDE_TEXT_MODEL,
      max_tokens: 6000,
      messages: [
        {
          role: 'user',
          content: `以下のテキストを意味のあるセクションに整理してください。
カテゴリ: 理念・ビジョン、人材育成、マーケティング、診療方針、教え・学び、患者対応、その他

関連する内容はまとめ、重複は除いてください。

【テキスト】
${text.slice(0, 6000)}

JSON形式のみで回答（前後の説明・コードブロック不要）:
{
  "sections": [
    {
      "title": "セクションタイトル",
      "category": "カテゴリ",
      "content": "このセクションの内容"
    }
  ]
}`,
        },
      ],
    });

    // 210: パース不能時は偽の空成功（sections:[]の200）を返さず、外側catchの500へ（fail-closed）
    const raw = extractAnthropicText(response.content);
    const parsed = robustJsonParse(raw);
    const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
    return NextResponse.json({ sections });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[clinic-profile/sectionize] 失敗:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
