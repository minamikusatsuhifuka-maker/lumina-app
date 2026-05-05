import { NextRequest } from 'next/server';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { topic, depth } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const depthPrompts: Record<string, string> = {
    quick: '1500字程度で簡潔にまとめてください。要点を押さえつつ、初心者にも理解しやすい説明を心がけてください。',
    standard: '3000字程度で詳しくまとめてください。概要・主要ポイント・最新動向・事例・まとめの構成で、具体例や数字を交えて読み応えのあるレポートにしてください。',
    deep: '5000字以上で網羅的かつ詳細に記述してください。各セクションを深く掘り下げ、背景・現状・課題・具体事例・統計・今後の展望を豊富な引用元とともに記述してください。',
  };

  // モードごとのmax_tokens
  const depthMaxTokens: Record<string, number> = {
    quick: 2500,
    standard: 5000,
    deep: 9000,
  };
  const selectedDepth = depth || 'standard';
  const maxTokens = depthMaxTokens[selectedDepth] || 5000;

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
            max_tokens: maxTokens,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            system: `あなたは優秀なリサーチアナリストです。
与えられたトピックについてWebを検索し、信頼性の高い情報を収集・統合して、
日本語で読みやすいレポートを作成してください。

絶対に守るルール：
1. URLは生のURLのみ記載（例: https://example.com）
2. HTMLタグは一切使用禁止（<a href=...>など）
3. Markdownのリンク記法も禁止（[テキスト](URL)形式も使わない）
4. 出典は「出典: サイト名 https://URL」の形式のみ
5. URLの後に属性やスタイルは絶対に書かない
6. 事実と推測を明確に区別してください`,
            messages: [{
              role: 'user',
              content: `トピック：${topic}
調査深度：${depthPrompts[depth || 'standard']}

# ${topic}
## 概要
## 主要ポイント
## 詳細分析
## まとめと活用アドバイス

各情報の引用元URLを必ず記載してください。
重要: URLは生のURL（https://...）のみ記載し、HTMLやMarkdownリンク記法は使わないでください。
出典の形式: 「出典: サイト名 https://URL」

必ず全セクションを最後まで完全に出力してください。途中で途切れないようにしてください。`,
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
