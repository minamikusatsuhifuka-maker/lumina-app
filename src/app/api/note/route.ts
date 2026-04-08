import { NextRequest } from 'next/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { query, maxResults = 10 } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'APIキーなし' }), { status: 500 });

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
            max_tokens: 4000,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            system: `あなたはnote.comの記事リサーチの専門家です。
指定されたキーワードでnote.comを検索し、有用な記事をピックアップして日本語でまとめてください。

出力形式（必ず守ること）：
## 🔍 「{キーワード}」のnote記事まとめ

### 📌 注目記事（上位${maxResults}件）

各記事について以下の形式で出力：

---
**記事タイトル**
👤 著者名
📝 要約（2〜3文で記事の内容と価値を説明）
🔗 URL: https://note.com/...
💡 おすすめポイント：この記事が有用な理由
---

### 💎 編集部おすすめ
最も参考になる記事を1〜2件ピックアップして理由を説明

### 📊 トレンド分析
このキーワードに関するnote記事全体の傾向・特徴を3点でまとめる`,
            messages: [{
              role: 'user',
              content: `「${query}」というキーワードでnote.comを検索してください。

検索URL: https://note.com/search?q=${encodeURIComponent(query)}&kind=note

有用な記事を最大${maxResults}件ピックアップして、各記事の要約・URLを含めてまとめてください。
特に実践的・具体的で読者にとって価値の高い記事を優先してください。`,
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
