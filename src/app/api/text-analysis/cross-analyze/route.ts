import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const PRESET_PROMPTS: Record<string, string> = {
  key_points: `複数の記事から【重要ポイント】を抽出してください。
- 各記事に共通する重要な知見・主張を箇条書きで整理
- 特に注目すべき独自の視点も拾い上げる
- 優先度（高/中/低）を付けて出力`,

  common_diff: `複数の記事の【共通点と相違点】を分析してください。
- 共通して主張されている点
- 記事間で意見が分かれている点・対立する視点
- その違いが生まれる背景や理由の考察`,

  future_prediction: `複数の記事の内容から【今後の予測・示唆】を導いてください。
- 現在のトレンド・方向性のまとめ
- 今後起こりうる変化・展開の予測
- 実践すべきアクション・学びへの応用方法`,

  learning: `複数の記事から【学びの要点】を整理してください。
- すぐに活用できる実践的な知識・スキル
- 概念の理解を深めるためのフレームワーク
- 今後の学習・研究に向けた方向性の提案`,

  summary: `複数の記事を【総合的にまとめ】てください。
- 全体を通じて伝えたいメッセージの統合
- 各記事の主要な論点を3行以内で要約
- 記事群全体から導かれる結論・インサイト`,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? '';

  const { articles, presetType, customPrompt, language } = await req.json();

  const encoder = new TextEncoder();

  if (!articles || articles.length < 2) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: '2件以上の記事を選択してください' })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const clinicPrompt = await getClinicSystemPrompt('text_analysis', userId);

  const systemPrompt = `あなたは複数のテキストを横断的に分析する専門家です。
与えられた複数の記事・テキストを深く読み込み、指示に従って分析・まとめを行います。
分析は論理的・体系的に行い、読者が「なるほど」と思える洞察を提供してください。
${clinicPrompt ? '\n\n' + clinicPrompt : ''}`;

  const analysisInstruction = presetType === 'custom'
    ? customPrompt
    : PRESET_PROMPTS[presetType] ?? PRESET_PROMPTS.summary;

  const articlesText = articles.map((a: { title?: string; category?: string; content: string }, i: number) => `
## 記事${i + 1}${a.title ? `：${a.title}` : ''}
${a.category ? `カテゴリ: ${a.category}` : ''}

${a.content}
`).join('\n---\n');

  const langNote = language === 'en' ? 'Respond in English.' : '日本語で回答してください。';

  const userPrompt = `${langNote}

以下の${articles.length}件の記事・テキストを分析してください。

【分析指示】
${analysisInstruction}

【対象記事（${articles.length}件）】
${articlesText}

Markdown形式で、見出し・箇条書きを使って見やすく整理して出力してください。`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`),
            );
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`),
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
}
