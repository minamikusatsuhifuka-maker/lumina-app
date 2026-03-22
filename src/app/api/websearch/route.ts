import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { query } = await req.json();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `あなたは優秀なリサーチアナリストです。
Webを検索して得た情報をもとに、日本語で詳しくまとめてください。
必ず各情報の引用元を [出典: サイト名](URL) の形式で明記してください。
事実と推測を明確に区別してください。`,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `以下のテーマについてWebを検索し、日本語で詳しくまとめてください。
引用元も明記し、以下の形式でまとめてください：

## 概要
（テーマの概要を2〜3文で）

## 主要ポイント
（箇条書きで5〜8点）

## 最新動向
（最近のトレンドや注目ポイント）

## まとめ
（結論と活用アドバイス）

テーマ：${query}

各セクションの情報源となったWebサイトのURLを必ず記載してください。`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return new Response(JSON.stringify({ result: text }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
