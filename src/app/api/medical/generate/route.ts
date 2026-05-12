import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';
import { trackUsage } from '@/lib/trackUsage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface DocTypeConfig {
  label: string;
  systemPrompt: string;
  structure: string;
}

const DOC_TYPE_CONFIGS: Record<string, DocTypeConfig> = {
  consent_dermatology: {
    label: '皮膚科診療同意書',
    systemPrompt: `あなたは皮膚科医療の専門家で、医療文書作成のエキスパートです。
インフォームドコンセントの原則に基づき、患者が十分に理解した上で
同意できる文書を作成します。医学的に正確で、かつ患者にわかりやすい言葉を使います。`,
    structure: `以下の構成で同意書を作成してください：

1. 【タイトル】「〇〇（施術名）に関する同意書」
2. 【施術の目的と方法】患者にわかりやすく説明
3. 【期待される効果】現実的な効果の説明
4. 【リスク・副作用】
   - 一般的なもの（赤み・腫れ等）
   - まれに起こるもの
   - 注意が必要な重篤なもの
5. 【治療を受けない場合】代替手段または経過観察
6. 【費用について】
7. 【質問・相談について】
8. 【同意欄】
   患者氏名：___________
   日付：___________
   署名：___________
   （同伴者がいる場合）続柄・氏名：___________`,
  },

  consent_cosmetic: {
    label: '美容施術同意書',
    systemPrompt: `あなたは美容皮膚科の専門家で、美容施術の同意書作成のエキスパートです。
美容目的の施術であることを踏まえ、患者が十分なメリット・リスク理解の上で
自由意思で選択できる文書を作成します。`,
    structure: `以下の構成で美容施術同意書を作成してください：

1. 【タイトル】「〇〇（施術名）施術同意書」
2. 【施術の概要】美容目的・仕組みをわかりやすく
3. 【施術の流れ】当日の手順
4. 【効果について】
   - 期待できる効果
   - 個人差について
   - 効果の持続期間
5. 【リスク・副作用・ダウンタイム】
   - よくある反応（赤み・腫れ・内出血等）
   - まれな副作用
   - 重篤な副作用
6. 【施術を受けられない方（禁忌）】
7. 【アフターケア・注意事項】
8. 【費用・キャンセルポリシー】
9. 【写真撮影について】
10. 【同意欄】`,
  },

  explanation: {
    label: '患者説明書',
    systemPrompt: `あなたは皮膚科の専門家で、患者説明書作成のエキスパートです。
専門用語をわかりやすい言葉に置き換え、患者が自宅でも読み返せる
実用的な説明書を作成します。`,
    structure: `以下の構成で患者説明書を作成してください：

1. 【タイトル】「〇〇（疾患・施術名）について」
2. 【この説明書について】
3. 【〇〇とは？】病気・施術の概要
4. 【原因・仕組み】
5. 【症状・特徴】
6. 【治療・ケアの方法】
   - 薬の使い方（処方がある場合）
   - 日常生活での注意点
7. 【経過・見通し】
8. 【こんな時はご連絡を】
   受診・連絡が必要な症状
9. 【よくあるご質問】
10. 【お問い合わせ先】`,
  },

  aftercare: {
    label: 'アフターケア指導書',
    systemPrompt: `あなたは美容皮膚科の専門家で、施術後のケア指導書作成のエキスパートです。
患者が自宅で正しくアフターケアできるよう、具体的でわかりやすい
指導書を作成します。`,
    structure: `以下の構成でアフターケア指導書を作成してください：

1. 【タイトル】「〇〇施術後のアフターケアについて」
2. 【施術直後の注意事項】
3. 【当日のケア】時間軸で具体的に
4. 【翌日〜数日間のケア】
5. 【スキンケアについて】
   - 洗顔・クレンジング
   - 保湿
   - 日焼け止め
6. 【避けること】
   - 入浴・サウナ
   - 運動
   - メイク
   - 飲酒
7. 【よくある経過と対処法】
8. 【こんな時はご連絡を】
9. 【次回来院予定】`,
  },
};

interface GenerateRequest {
  docType: string;
  procedureName: string;
  additionalInfo?: string;
  researchText?: string;
  language?: string;
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

  const { docType, procedureName, additionalInfo, researchText, contextInfo } =
    body;

  const config = DOC_TYPE_CONFIGS[docType];
  if (!config) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: '不明な文書タイプです' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  if (!procedureName?.trim()) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: '施術・診療名は必須です' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  // クリニック背景情報を取得
  const clinicPrompt = await getClinicSystemPrompt('medical', userId);

  const systemPrompt = `${config.systemPrompt}${
    clinicPrompt ? '\n\n【クリニック情報】\n' + clinicPrompt : ''
  }${contextInfo ? '\n\n【参考背景情報】\n' + contextInfo : ''}`;

  const userPrompt = `【施術・診療名】
${procedureName}

【文書タイプ】
${config.label}

【構成・指示】
${config.structure}

${additionalInfo ? `【追加情報・特記事項】\n${additionalInfo}\n` : ''}
${researchText ? `【参考リサーチ情報】\n${researchText.slice(0, 3000)}\n` : ''}

上記に基づいて、完全な${config.label}を作成してください。
医学的に正確で、患者が理解しやすい文書にしてください。`;

  const encoder = new TextEncoder();
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
          featureKey: 'medical',
          stepLabel: `${docType}:${procedureName}`,
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
