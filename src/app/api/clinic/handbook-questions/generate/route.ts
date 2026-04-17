export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { content, prompt } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const userPrompt = `以下のハンドブックの章内容を読んで、スタッフへの問いかけを生成してください。

【章の内容】
${content}

【生成の指示】
${prompt}

問いかけのみを出力してください。前置きや説明は不要です。`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const data = await response.json();
  const question = (data.content || [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
  return NextResponse.json({ question });
}
