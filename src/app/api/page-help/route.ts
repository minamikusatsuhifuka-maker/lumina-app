import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { prompt } = await req.json();
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
      max_tokens: 600,
      system: 'xLUMINAのAIアシスタントです。簡潔・実用的・箇条書きで答えてください。',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const help = data.content?.[0]?.text ?? 'ヘルプを取得できませんでした。';
  return NextResponse.json({ help });
}
