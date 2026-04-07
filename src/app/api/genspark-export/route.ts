import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { content, format } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const formatPrompts: Record<string, string> = {
    presentation: `以下の文章をGensparkでプレゼンスライドを作成するための最適な構成に変換してください。
出力形式：
# スライド1タイトル
内容（箇条書き）

# スライド2タイトル
内容（箇条書き）

（以降同様）

スライド枚数：5〜10枚程度。各スライドの内容は簡潔に。`,

    outline: `以下の文章をGenspark向けのアウトライン形式（見出し＋要点）に変換してください。
構成：大見出し → 中見出し → 要点の3階層で整理してください。`,

    summary: `以下の文章をGensparkで使いやすいように、300字以内の要約と5つのキーポイントに整理してください。`,
  };

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
      system: formatPrompts[format] || formatPrompts.presentation,
      messages: [{ role: 'user', content }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';
  return new Response(JSON.stringify({ result: text }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
