import { NextRequest } from 'next/server';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { query, mode, maxTokens, period } = await req.json();

  const periodText = period === '1week' ? '1週間'
    : period === '1month' ? '1ヶ月'
    : period === '3months' ? '3ヶ月'
    : '';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: maxTokens ?? 2000,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            system: `あなたは優秀なリサーチアナリストです。
Webを検索して得た情報をもとに、日本語で詳しくまとめてください。

絶対に守るルール：
1. URLは生のURLのみ記載（例: https://example.com）
2. HTMLタグは一切使用禁止（<a href=...>など）
3. Markdownのリンク記法も禁止（[テキスト](URL)形式も使わない）
4. 出典は「出典: サイト名 https://URL」の形式のみ
5. URLの後に属性やスタイルは絶対に書かない
${periodText ? `6. 特に直近${periodText}以内の最新情報を優先して検索・まとめてください` : ''}`,
            messages: [{
              role: 'user',
              content: `テーマ：${query}

以下の構成でまとめてください：
## 概要
## 主要ポイント
## まとめ

各セクションの情報源URLを必ず記載してください。
重要: URLは生のURL（https://...）のみ記載し、HTMLやMarkdownリンク記法は使わないでください。
出典の形式: 「出典: サイト名 https://URL」`,
            }],
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          controller.enqueue(encoder.encode(`data: {"type":"error","message":"APIエラー: ${response.status}"}\n\n`));
          controller.close();
          return;
        }

        const data = await response.json();
        const text = (data.content || [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n');

        const lines = text.split('\n');
        for (const line of lines) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: line + '\n' })}\n\n`));
          await new Promise(r => setTimeout(r, 5));
        }

        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
      } catch (error: any) {
        controller.enqueue(encoder.encode(`data: {"type":"error","message":"${error.message}"}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
