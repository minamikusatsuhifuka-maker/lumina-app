import { NextRequest } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { topic, depth } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const depthPrompts: Record<string, string> = {
    quick: '簡潔に3〜5つのポイントでまとめてください（500文字程度）',
    standard: '詳しく調査し、概要・主要ポイント・最新動向・まとめの構成で報告してください（1500文字程度）',
    deep: '徹底的に調査し、背景・現状・課題・事例・今後の展望を含む詳細レポートを作成してください（2000文字程度）',
  };

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
与えられたトピックについてWebを検索し、信頼性の高い情報を収集・統合して、
日本語で読みやすいレポートを作成してください。

【重要なルール】
- 引用元は必ず [出典: サイト名](https://URL) の形式のみで記載してください
- HTMLタグは絶対に使用しないでください
- <a href=...> などのHTMLは書かないでください
- URLはMarkdown形式 [名前](URL) のみで記載してください
- 例: [出典: 日経新聞](https://nikkei.com/article/123)
- 事実と推測を明確に区別してください`,
            messages: [{
              role: 'user',
              content: `トピック：${topic}
調査深度：${depthPrompts[depth || 'standard']}

# ${topic}
## 概要
## 主要ポイント
## 詳細分析
## まとめと活用アドバイス

各情報の引用元URLを必ず記載してください。`,
            }],
          }),
        });

        if (!response.ok) {
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
