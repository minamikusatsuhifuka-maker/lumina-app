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
            max_tokens: 1500,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            system: ({
              default: `あなたは優秀なリサーチアナリストです。Webを検索して得た情報をもとに、
日本語で詳しくまとめてください。必ず各情報の引用元を [出典: サイト名](URL) の形式で明記してください。`,
              management: `あなたは人材育成・組織マネジメントの専門家です。
最新のマネジメント手法・リーダーシップ論・人材育成トレンドについて
実践的な情報を収集し、日本語でまとめてください。
心理的安全性・OKR・1on1・コーチング・ティール組織等の最新手法も含めてください。
引用元を必ず明記してください。`,
              marketing: `あなたはデジタルマーケティングの専門家です。
最新のマーケティング戦略・SNS活用・コンテンツマーケティング・SEOトレンドについて
実践的な情報を日本語でまとめてください。
最新の成功事例・データ・ツールも含めてください。引用元を必ず明記してください。`,
              hr: `あなたは採用・人事戦略の専門家です。
最新の採用トレンド・優秀人材の獲得方法・エンゲージメント向上策・
組織文化構築について実践的な情報を日本語でまとめてください。
引用元を必ず明記してください。`,
            } as Record<string, string>)[mode || 'default'] || `あなたは優秀なリサーチアナリストです。Webを検索して得た情報をもとに、
日本語で詳しくまとめてください。必ず各情報の引用元を [出典: サイト名](URL) の形式で明記してください。`,
            messages: [{
              role: 'user',
              content: `テーマ：${query}

以下の構成でまとめてください：
## 概要
## 主要ポイント
## まとめ

各セクションの情報源URLを必ず記載してください。`,
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
