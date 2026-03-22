import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { topic } = await req.json();
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
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `あなたは優秀なリサーチアナリストです。指定されたトピックの最新情報を収集し、
要点を箇条書きでまとめてください。引用元URLも明記してください。`,
      messages: [{
        role: 'user',
        content: `「${topic}」について最新情報を5〜8点収集してまとめてください。日付・出典を明記してください。`,
      }],
    }),
  });

  const data = await response.json();
  const result = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return NextResponse.json({ result, topic, date: new Date().toLocaleDateString('ja-JP') });
}
