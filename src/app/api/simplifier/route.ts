import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

const LEVEL_PROMPTS: Record<string, string> = {
  elementary: '小学生（10歳）でも理解できるように、とても簡単な言葉で説明してください。難しい漢字はひらがなにし、身近なたとえを使ってください。',
  junior: '中学生（15歳）が理解できるように、わかりやすく説明してください。専門用語は簡単な言葉に置き換えてください。',
  general: '一般の大人が理解できるように、専門用語を噛み砕いて説明してください。適度に詳しく、しかし読みやすい文章にしてください。',
  expert: 'この分野の専門家向けに、正確な専門用語を使い、技術的に詳細な説明にしてください。前提知識がある読者を想定してください。',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { text, level, addExamples } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!text || !level) {
    return NextResponse.json({ error: 'テキストとレベルは必須です' }, { status: 400 });
  }

  const examplesInstruction = addExamples
    ? '\n\nまた、理解を助ける具体例を2〜3個追加してください。examples_addedフィールドに追加した例を配列で入れてください。'
    : '\n\nexamples_addedは空配列にしてください。';

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
        max_tokens: 4000,
        system: `あなたは文章の難易度を変換する専門家です。
指定されたレベルに合わせて文章を書き換えてください。
必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "converted_text": "変換後の文章",
  "key_terms": [
    { "original": "元の用語", "simplified": "変換後の用語" }
  ],
  "reading_time": "読了時間（例: 約2分）",
  "level_check": "変換後の難易度が適切かの確認コメント",
  "examples_added": ["追加した具体例の配列（なければ空配列）"]
}`,
        messages: [{
          role: 'user',
          content: `${LEVEL_PROMPTS[level] || LEVEL_PROMPTS.general}${examplesInstruction}\n\n【変換対象テキスト】\n${text}`,
        }],
      }),
    });

    const data = await response.json();
    const text2 = data.content?.[0]?.text ?? '{}';

    const jsonMatch = text2.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI応答のパースに失敗しました' }, { status: 500 });
    }
    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `難易度変換に失敗しました: ${msg}` }, { status: 500 });
  }
}
