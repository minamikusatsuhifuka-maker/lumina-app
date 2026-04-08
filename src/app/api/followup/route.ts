import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { question, context } = await req.json();
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
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `あなたは優秀なリサーチアシスタントです。
提供された調査結果をベースに、ユーザーの質問に詳しく答えてください。
必要に応じてWeb検索で最新情報を補完してください。
回答は日本語で、具体的かつ簡潔にまとめてください。`,
      messages: [{
        role: 'user',
        content: `【調査結果（コンテキスト）】\n${context.slice(0, 3000)}\n\n【質問】\n${question}`,
      }],
    }),
  });

  const data = await response.json();
  const result = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');

  return NextResponse.json({ result });
}
