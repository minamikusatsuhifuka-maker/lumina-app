import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session ? (session.user as any).id : '';
  const { topic, depth } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // クリニック背景情報を取得（任意）
  const clinicPrompt = userId ? await getClinicSystemPrompt('deepresearch', userId) : '';
  const clinicStr = clinicPrompt ? `\n\n${clinicPrompt}` : '';

  // モード別の本文指示（文字数より完結性を最優先）
  const depthPrompts: Record<string, string> = {
    quick: '1500字程度で簡潔にまとめてください。要点を絞りつつ、必ず最後の「まとめ・結論」まで完結させてください。',
    standard: '3000字程度で詳しくまとめてください。概要・主要ポイント・最新動向・事例を含め、必ず最後の「まとめ・結論」まで完結させてください。',
    deep: '5000字程度の詳細なリサーチレポートを作成してください。各章を深く掘り下げつつ、必ず最後の「まとめ・結論」で締めくくってください。文字数より完結性を最優先してください。',
  };

  // モード別のmax_tokens（完結性確保のため余裕を持たせる）
  const depthMaxTokens: Record<string, number> = {
    quick: 3000,
    standard: 6000,
    deep: 12000,
  };
  const selectedDepth = depth || 'standard';
  const maxTokens = depthMaxTokens[selectedDepth] || 6000;

  // モード別のアウトライン構成
  const depthOutlines: Record<string, string> = {
    quick: `## はじめに
## 要点（3〜5項目）
## まとめ・結論`,
    standard: `## はじめに
## 背景と概要
## 主要ポイント・最新動向
## 事例・実践
## まとめ・結論`,
    deep: `## はじめに
## 背景と概要
## 詳細解説（複数章で深く掘り下げ）
## 実践・活用方法
## まとめ・結論`,
  };
  const outline = depthOutlines[selectedDepth] || depthOutlines.standard;

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
6. 事実と推測を明確に区別してください${clinicStr}`,
            messages: [{
              role: 'user',
              content: `トピック：${topic}
調査深度の指示：${depthPrompts[selectedDepth]}

【必須要件】
- 必ず「まとめ・結論」セクションで締めくくること
- 途中で終わらず最後まで完結させること
- 文字数が多少前後しても完結を最優先すること
- 以下の構成に従うこと

# ${topic}
${outline}
## 参考・補足

【出力ルール】
- 各情報の引用元URLを必ず記載
- URLは生のURL（https://...）のみ。HTMLタグやMarkdownリンク記法は禁止
- 出典の形式: 「出典: サイト名 https://URL」
- 事実と推測を明確に区別

【最重要】必ず最後の「まとめ・結論」まで書き切ってください。
途中で終わることは絶対に避けてください。
時間や長さが厳しい場合は中盤を簡潔にしてでも、結論セクションを必ず含めてください。`,
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
