import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type GenerateContext = unknown;

const GENERATORS: Record<string, (ctx: GenerateContext) => string> = {
  lp: (ctx) => `あなたは月商1000万円以上の実績を持つセールスコピーライターです。
以下の事業情報を元に、読者の心を動かし行動を促すLPコピーを作成してください。

【事業情報】
${JSON.stringify(ctx, null, 2)}

【必須の構成】
1. ヘッドライン（損失回避＋好奇心ギャップを活用した強力なキャッチコピー）
2. サブヘッドライン（具体的なベネフィット）
3. リード文（共感→問題提起→解決の予告）
4. 課題の明確化（読者の痛みをリアルに描写）
5. 解決策の提示（なぜこれが有効か）
6. ベネフィット一覧（箇条書き7〜10項目）
7. 社会的証明（想定される声・数字）
8. プロフィール・権威性
9. オファー内容と価格
10. よくある質問（反論処理）
11. 限定性・緊急性
12. CTA（行動喚起）

心理学要素：ナッジ・損失回避・社会的証明・希少性・PASONAの法則を全て組み込む。`,

  step_mail: (ctx) => `あなたは成約率の高いステップメールを設計する専門家です。
以下の情報を元に21通のステップメールシーケンスを作成してください。

【事業情報】
${JSON.stringify(ctx, null, 2)}

【21通の構成】
Day0: 登録直後「歓迎＋あなたの物語」
Day1: 「読者の最大の悩みに深く共感」
Day3: 「なぜうまくいかないのか（真の原因）」
Day5: 「解決のヒント（価値提供）」
Day7: 「成功事例ストーリー」
Day10: 「無料コンテンツ（教育）」
Day12: 「よくある誤解を解く」
Day14: 「あなたの失敗談と学び」
Day16: 「オファー予告（期待感醸成）」
Day18: 「オファー本番（メイン商品紹介）」
Day19: 「FAQ・反論処理」
Day20: 「お客様の声・社会的証明」
Day21: 「締め切り・最後のCTA」

各メールに：件名・本文・PS文を含める。`,

  kindle: (ctx) => `あなたはAmazon Kindleで売れる書籍を設計する専門家です。
以下の情報を元に、読者が「買わずにはいられない」Kindle書籍の完全プランを作成してください。

【事業情報】
${JSON.stringify(ctx, null, 2)}

【出力内容】
1. 書籍タイトル案（5案）＋選定理由
2. サブタイトル案
3. キャッチコピー（Amazon説明文用）
4. ターゲット読者像
5. 目次（序章＋7〜10章＋終章）
6. 各章の概要（200字）
7. Amazon KDP設定
   - カテゴリ（2つ）
   - キーワード（7個）
   - 価格設定
8. Amazon説明文（2000字）
9. 出版・マーケティングスケジュール
10. レビュー獲得戦略`,
};

interface GenerateRequest {
  generateType: string;
  projectData: GenerateContext;
  contextInfo?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { generateType, projectData, contextInfo } = body;
  const promptFn = GENERATORS[generateType];
  if (!promptFn) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: '不明な生成タイプ' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  // 参考背景情報があれば末尾に追記
  const basePrompt = promptFn(projectData);
  const prompt = contextInfo
    ? `${basePrompt}\n\n【参考背景情報】\n${contextInfo}`
    : basePrompt;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 6000,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        });

        let usageInput = 0;
        let usageOutput = 0;
        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`,
              ),
            );
          }
          if (event.type === 'message_start' && event.message?.usage) {
            usageInput = event.message.usage.input_tokens ?? 0;
          }
          if (event.type === 'message_delta' && event.usage) {
            usageOutput = event.usage.output_tokens ?? 0;
          }
        }
        await trackUsage({
          userId,
          featureKey: 'business',
          stepLabel: generateType,
          inputTokens: usageInput,
          outputTokens: usageOutput,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'done', usage: { input_tokens: usageInput, output_tokens: usageOutput } })}\n\n`,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message })}\n\n`,
          ),
        );
      } finally {
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
