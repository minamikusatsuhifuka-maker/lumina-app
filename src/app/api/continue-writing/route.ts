import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { currentText, mode, style, audience } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

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
      stream: true,
      system: `あなたは優秀なライターです。
与えられた文章の続きを自然に書いてください。
- 文体・トーン・テーマを完全に引き継ぐ
- 前の文章と重複しないようにする
- 500〜800字程度の続きを書く
- 文章モード：${mode ?? 'blog'}
- 文体：${style ?? 'カジュアル'}
- 対象読者：${audience ?? '一般'}`,
      messages: [{
        role: 'user',
        content: `以下の文章の続きを自然に書いてください：\n\n${currentText.slice(-500)}`,
      }],
    }),
  });

  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
