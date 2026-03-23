import { NextRequest } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { query, mode } = await req.json();

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
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            system: `あなたは優秀なリサーチアナリストです。
Webを検索して得た情報をもとに、日本語で詳しくまとめてください。

【重要なルール】
- 引用元は必ず [出典: サイト名](https://URL) の形式のみで記載してください
- HTMLタグは絶対に使用しないでください
- <a href=...> などのHTMLは書かないでください
- URLはMarkdown形式 [名前](URL) のみで記載してください
- 例: [出典: 東洋経済オンライン](https://toyokeizai.net/articles/123)`,
            messages: [{
              role: 'user',
              content: `テーマ：${query}

以下の構成でまとめてください：
## 概要
## 主要ポイント
## まとめ

各セクションの情報源URLを必ず記載してください。
URLは必ず [出典: サイト名](URL) のMarkdown形式で記載し、HTMLタグは絶対に使わないでください。`,
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
