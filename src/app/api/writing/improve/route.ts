import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

// AI文章改善API：読みやすさスコア等をもとに改善提案+改善後文章をストリームで返す（Claude Sonnet 4.6）
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY が未設定です' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const {
      originalText,
      readabilityScore,
      scoreDetails,
      topic,
      style,
    } = await req.json();

    if (!originalText) {
      return new Response(JSON.stringify({ error: '文章が必要です' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // スコア詳細はオブジェクト形式と配列形式の両方に対応
    const buildFeedback = (): string => {
      if (!scoreDetails) return '';
      // 配列形式: [{ name, score, max, advice }]
      if (Array.isArray(scoreDetails)) {
        return scoreDetails
          .map((d: any) => `- ${d.name}: ${d.score}/${d.max} ${d.advice ? `（${d.advice}）` : ''}`)
          .join('\n');
      }
      // オブジェクト形式: { length, kanji, paragraph, punctuation }
      const o = scoreDetails as Record<string, number>;
      return [
        `- 文章の長さ: ${o.length ?? '?'}/25点`,
        `- 漢字率: ${o.kanji ?? '?'}/25点`,
        `- 段落構成: ${o.paragraph ?? '?'}/25点`,
        `- 読点バランス: ${o.punctuation ?? '?'}/25点`,
      ].join('\n');
    };

    const systemPrompt = `あなたは日本語の文章改善の専門家です。
与えられた文章の問題点を分析し、具体的な改善提案を行い、改善後の文章を出力します。
必ず以下のJSON形式のみで回答してください（前後に説明文やMarkdownコードブロックは不要）:

{
  "suggestions": [
    { "point": "改善ポイントのタイトル", "detail": "具体的な説明", "priority": "高|中|低" }
  ],
  "improvedText": "改善後の全文"
}`;

    const userPrompt = `以下の文章を分析・改善してください。

【トピック】
${topic ?? '未指定'}

【文体】
${style ?? '未指定'}

【読みやすさスコア】
総合: ${readabilityScore ?? '?'}点/100点
${buildFeedback()}

【改善が必要な主な点】
- 一文が長すぎる箇所を句点で区切る
- 読みやすさスコアの低い項目を優先的に改善する
- 文章のトーンと内容は維持したまま改善する

【原文】
${originalText}

上記を踏まえて、3〜5個の改善提案と改善後の全文をJSONで返してください。`;

    const client = new Anthropic({ apiKey });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 8000,
            stream: true,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          });

          let fullText = '';
          for await (const event of response as any) {
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              const t: string = event.delta.text || '';
              fullText += t;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: t })}\n\n`)
              );
            }
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`)
          );
          controller.close();
        } catch (err: any) {
          console.error('[writing/improve] エラー:', err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: err?.message || String(err) })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
