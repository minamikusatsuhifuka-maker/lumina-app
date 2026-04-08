import { NextRequest } from 'next/server';

export const maxDuration = 60;

const STRATEGY_PROMPTS: Record<string, string> = {
  mvv: `あなたは世界トップクラスの経営コンサルタントです。Mission・Vision・Valuesを策定してください。
# Mission（ミッション）
# Vision（ビジョン）
# Values（バリュー）5〜7個
# ブランドスローガン案（3案）
# MVV策定の意図・解説
HTMLタグは使わず、Markdownのみで記述してください。`,

  philosophy: `あなたは企業理念・哲学の専門家です。
# 企業理念（200字）
# 経営哲学（5原則）
# クレド（行動信条10条）
# 理念浸透のための施策案（5つ）
HTMLタグは使わず、Markdownのみで記述してください。`,

  market_strategy: `あなたはマーケティング戦略の第一人者です。
# 市場分析
# STP分析
# 4P戦略
# デジタルマーケティング戦略
# 90日間マーケティングロードマップ
HTMLタグは使わず、Markdownのみで記述してください。`,

  brand: `あなたはブランド戦略の専門家です。
# ブランドアイデンティティ
# ターゲットペルソナ（3タイプ）
# ブランドボイス＆トーン
# ブランドストーリー（300字）
# コンテンツ戦略
# KPI設定
HTMLタグは使わず、Markdownのみで記述してください。`,

  hiring: `あなたは採用戦略・人事の専門家です。
# 採用ペルソナ
# 採用メッセージ（3パターン）
# 採用媒体・チャネル戦略
# 選考フロー設計
# 採用面接質問集（20問）
# オンボーディング設計（30/60/90日）
HTMLタグは使わず、Markdownのみで記述してください。`,

  talent: `あなたは人材育成・組織開発の専門家です。
# 人材育成の基本方針
# スキルマップ＆成長ステージ
# 育成プログラム設計
# 1on1ミーティング設計
# 評価制度設計
# 最新マネジメント手法
HTMLタグは使わず、Markdownのみで記述してください。`,

  organization: `あなたは組織デザイン・組織開発の専門家です。
# 組織診断
# 組織設計原則
# カルチャー設計
# コミュニケーション設計
# エンゲージメント向上策
# 組織変革ロードマップ（1年間）
HTMLタグは使わず、Markdownのみで記述してください。`,
};

export async function POST(req: NextRequest) {
  const { content, strategyType } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 即座に最初のバイトを送信（Vercelタイムアウト回避）
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'interleaved-thinking-2025-05-14',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 3000,
            stream: true,
            system: STRATEGY_PROMPTS[strategyType] || STRATEGY_PROMPTS.mvv,
            messages: [{
              role: 'user',
              content: `以下の情報をもとに分析・提案を作成してください。
情報が少ない場合はベストプラクティスを補完して提案してください。

【入力情報】
${content}

日本語で、具体的かつ実用的な内容を出力してください。
HTMLタグは使わず、Markdownのみで記述してください。`,
            }],
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          controller.enqueue(encoder.encode(`data: {"type":"error","message":"APIエラー: ${response.status}"}\n\n`));
          controller.close();
          return;
        }

        // Anthropic SSEストリームをそのままフォワード
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ type: 'text', content: data.delta.text })}\n\n`
                  ));
                } else if (data.type === 'message_stop') {
                  controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
                }
              } catch {}
            }
          }
        }
      } catch (e: any) {
        controller.enqueue(encoder.encode(
          `data: {"type":"error","message":"${e.message}"}\n\n`
        ));
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
