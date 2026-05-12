import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';
import { trackUsage } from '@/lib/trackUsage';

export const runtime = 'nodejs';
export const maxDuration = 180;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface DeepDiveMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GENERATION_PROMPTS: Record<
  string,
  (conversation: string, clinicInfo: string) => string
> = {
  hp_content: (conv, clinic) => `あなたはクリニックのホームページ制作・医療マーケティングの専門家です。
${clinic ? `\n【クリニック情報】\n${clinic}\n` : ''}
以下の対話で収集した情報を元に、患者の心に響くHP内容を生成してください。

【対話で収集した情報】
${conv}

【生成するHP内容の要件】
- 患者視点で読みやすい文体
- クリニックの強みが伝わる構成
- 行動を促すCTA（予約・問い合わせ）を含める
- SEOを意識したキーワードを自然に含める
- 各セクション（ヘッドライン・本文・特徴・CTA）を明確に分けて出力`,

  copy: (conv, clinic) => `あなたは売上を最大化するセールスコピーライターです。
${clinic ? `\n【背景情報】\n${clinic}\n` : ''}
以下の対話内容を元に、読者の感情を動かす強力なコピーを生成してください。

【対話で収集した情報】
${conv}

【生成要件】
- PASONA法則・損失回避・社会的証明を活用
- 感情に訴える表現と論理的根拠を組み合わせる
- 複数パターン（A案・B案）を提示
- 各コピーに使用した心理テクニックを説明`,

  write: (conv, clinic) => `あなたはプロのライターです。
${clinic ? `\n【背景情報】\n${clinic}\n` : ''}
以下の対話内容を元に、目的に合った文章を生成してください。

【対話で収集した情報】
${conv}

【生成要件】
- 対話で確認したトーン・文体を正確に反映
- 読者の心に届く表現
- 構成（序論・本論・結論）を意識
- 指定文字数に合わせる`,

  step_mail: (conv, clinic) => `あなたはメールマーケティングの専門家です。
${clinic ? `\n【背景情報】\n${clinic}\n` : ''}
以下の対話内容を元に、効果的なステップメールシーケンスを生成してください。

【対話で収集した情報】
${conv}

【生成要件】
- 各メールに件名・本文・PSを含める
- 読者との関係構築→価値提供→オファーの流れ
- 各メールの目的と送信タイミングを明記
- 開封率・クリック率を高める工夫`,

  lp: (conv, clinic) => `あなたは高転換率LPを設計するマーケターです。
${clinic ? `\n【背景情報】\n${clinic}\n` : ''}
以下の対話内容を元に、転換率の高いLPコピーを生成してください。

【対話で収集した情報】
${conv}

【生成要件】
- ヒーロー・ベネフィット・社会的証明・FAQ・CTAの構成
- PASONA法則を全セクションに適用
- スマホでも読みやすい短い段落
- 感情的訴求と論理的根拠のバランス`,

  deepresearch: (conv, clinic) => `あなたは深くリサーチするリサーチャーです。
${clinic ? `\n【背景情報】\n${clinic}\n` : ''}
以下の対話で明確になった目的・観点で、徹底的なリサーチレポートを作成してください。

【対話で収集した情報・リサーチ方針】
${conv}

【生成要件】
- 対話で特定された重要な観点を中心に深掘り
- 具体的なデータ・事例・数字を含める
- 実践に直結する情報を優先
- 信頼性の高い情報と推測の区別を明確に
- 5000字以上の詳細レポート`,
};

interface GenerateRequest {
  featureType: string;
  messages: DeepDiveMessage[];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { featureType, messages = [] } = body;
  const clinicPrompt = await getClinicSystemPrompt(featureType, userId);

  // 対話履歴を文字列化
  const conversationText = messages
    .map(
      (m) => `${m.role === 'user' ? '👤 ユーザー' : '🤖 AI'}: ${m.content}`,
    )
    .join('\n\n');

  const promptFn =
    GENERATION_PROMPTS[featureType] ?? GENERATION_PROMPTS.write;
  const prompt = promptFn(conversationText, clinicPrompt ?? '');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let usageInput = 0;
      let usageOutput = 0;

      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 6000,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        });

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

        // 使用量記録（featureKey は機能別キーで集計可能に）
        await trackUsage({
          userId,
          featureKey: featureType,
          stepLabel: '対話深掘り生成',
          inputTokens: usageInput,
          outputTokens: usageOutput,
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'done',
              usage: {
                input_tokens: usageInput,
                output_tokens: usageOutput,
              },
            })}\n\n`,
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
        try {
          controller.close();
        } catch {
          /* skip */
        }
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
