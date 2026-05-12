import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';

export const runtime = 'nodejs';
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// 機能別の対話深掘り設計
const FEATURE_CONTEXTS: Record<
  string,
  { role: string; goal: string; questions: string[] }
> = {
  hp_content: {
    role: 'クリニックのホームページ制作・医療マーケティングの専門家',
    goal: 'クリニックの強みが伝わり、患者が来院したくなるHP内容を生成する',
    questions: [
      'どのページのコンテンツですか？（トップ・診療内容・医師紹介・アクセス等）',
      'このクリニックの一番の強みや特徴は何ですか？',
      'ターゲットとなる患者層は？（年齢・悩み・来院動機）',
      '競合クリニックと比べて差別化したいポイントは？',
      '掲載したい施術・診療メニューを教えてください',
    ],
  },
  copy: {
    role: '売上を最大化するセールスコピーライター',
    goal: '読者の感情を動かし、行動を促す説得力あるコピーを生成する',
    questions: [
      '何のためのコピーですか？（広告・LP・SNS・チラシ等）',
      'ターゲット読者の最大の悩みや欲求は何ですか？',
      '訴求したい最大のベネフィットは？',
      'ブランドのトーン・ムードは？（高級感・親しみやすさ・専門性等）',
      '行動させたいこと（CTA）は何ですか？',
    ],
  },
  write: {
    role: '読者の心を動かすプロライター',
    goal: '目的に合った読みやすく説得力のある文章を生成する',
    questions: [
      'どんな種類の文章ですか？（ブログ・メール・SNS投稿・説明文等）',
      'メインテーマ・伝えたいことの核心は？',
      '読者に与えたい感情や行動は？',
      '文体の希望は？（です・ます調、カジュアル、専門的等）',
      '文字数の目安や特別な制約はありますか？',
    ],
  },
  step_mail: {
    role: 'メールマーケティングの専門家',
    goal: '読者との関係を深め、最終的に購買につながるステップメールを設計する',
    questions: [
      '誰に送るメールですか？（新規登録者・見込み客・既存顧客等）',
      '最終的に何をしてほしいですか？（購入・予約・申込等）',
      '読者の現在の状態と悩みは？',
      'メールの通数と期間の目安は？',
      'あなたのブランドや商品の最大の価値は？',
    ],
  },
  lp: {
    role: '高転換率LPを設計するマーケター・コピーライター',
    goal: '訪問者を顧客に変換する高転換率のLPを生成する',
    questions: [
      '商品・サービスの名前と概要を教えてください',
      'ターゲット顧客の最大の悩み・欲求は？',
      '他社との最大の差別化ポイントは？',
      '価格帯と特典・保証の内容は？',
      '既存顧客の声や実績・数字はありますか？',
    ],
  },
  deepresearch: {
    role: 'リサーチ設計の専門家',
    goal: '目的に合った深く有益なリサーチを実行する',
    questions: [
      'このリサーチの目的・使い途は何ですか？',
      '特に深掘りしたい観点・角度はありますか？',
      'どのような情報が最も価値がありますか？（数字・事例・トレンド・比較等）',
      'リサーチ結果をどのように活用しますか？',
      '除外したい情報や制約はありますか？',
    ],
  },
};

interface DeepDiveMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface DeepDiveRequest {
  messages: DeepDiveMessage[];
  featureType: string;
  userInput?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: DeepDiveRequest;
  try {
    body = (await req.json()) as DeepDiveRequest;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { messages = [], featureType, userInput } = body;
  const context = FEATURE_CONTEXTS[featureType] ?? FEATURE_CONTEXTS.write;
  const clinicPrompt = await getClinicSystemPrompt(featureType, userId);

  const systemPrompt = `あなたは${context.role}です。
ユーザーと対話しながら、${context.goal}ために必要な情報を引き出します。

## 対話の進め方
1. ユーザーの回答を受け取り、内容を深く理解する
2. 不明点・曖昧な点があれば具体的な質問で深掘りする
3. 追加で引き出すべき重要情報があれば質問する
4. 十分な情報が集まったと判断したら「準備完了」を示す

## 重要なルール
- 一度に質問するのは最大2つまで（多すぎると負担になる）
- ユーザーの回答の良い点を具体的に褒めてから次の質問へ
- ユーザーが「生成して」「これで行く」「OK」と言ったら情報整理をして生成準備完了を告げる
- 情報が十分集まったと思ったら「この情報で生成できます」と伝えてユーザーに判断を委ねる

## 想定する質問観点
${context.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## クリニック背景情報
${clinicPrompt ?? 'なし'}

## 現在の状態
これまでの対話: ${messages.length}往復`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 初回（messages空）は最初の質問を提示する仮想ユーザー入力
        const finalMessages: DeepDiveMessage[] =
          messages.length === 0
            ? [
                {
                  role: 'user',
                  content: `${featureType}の生成を手伝ってください。まず必要な情報を質問してください。`,
                },
              ]
            : [...messages];

        if (userInput && messages.length > 0) {
          finalMessages.push({ role: 'user', content: userInput });
        }

        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1200,
          stream: true,
          system: systemPrompt,
          messages: finalMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
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
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`),
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
