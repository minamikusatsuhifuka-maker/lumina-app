import { NextRequest } from 'next/server';

export const maxDuration = 60;

const STRATEGY_PROMPTS: Record<string, string> = {
  mvv: `あなたは世界トップクラスの経営コンサルタントです。
Mission（使命）・Vision（ビジョン）・Values（価値観）を策定してください。

# Mission（ミッション）
# Vision（ビジョン）
# Values（バリュー）
# ブランドスローガン案（3案）
# MVV策定の意図・解説

URLやHTMLタグは使わないでください。`,

  philosophy: `あなたは企業理念・哲学の専門家です。
# 企業理念
# 経営哲学（5原則）
# クレド（行動信条10条）
# 理念浸透のための施策案（5つ）

URLやHTMLタグは使わないでください。`,

  market_strategy: `あなたはマーケティング戦略の第一人者です。
# 市場分析
# STP分析
# 4P戦略
# デジタルマーケティング戦略
# 90日間マーケティングロードマップ

URLやHTMLタグは使わないでください。`,

  brand: `あなたはブランド戦略の専門家です。
# ブランドアイデンティティ
# ターゲットペルソナ（3タイプ）
# ブランドボイス＆トーン
# ブランドストーリー
# コンテンツ戦略
# KPI設定

URLやHTMLタグは使わないでください。`,

  hiring: `あなたは採用戦略・人事の専門家です。
# 採用ペルソナ
# 採用メッセージ（3パターン）
# 採用媒体・チャネル戦略
# 選考フロー設計
# 採用面接質問集（20問）
# オンボーディング設計（30/60/90日）

URLやHTMLタグは使わないでください。`,

  talent: `あなたは人材育成・組織開発の専門家です。
# 人材育成の基本方針
# スキルマップ＆成長ステージ
# 育成プログラム設計
# 1on1ミーティング設計
# 評価制度設計
# 最新マネジメント手法（OKR・心理的安全性・ティール組織）

URLやHTMLタグは使わないでください。`,

  organization: `あなたは組織デザイン・組織開発の専門家です。
# 組織診断
# 組織設計原則
# カルチャー設計
# コミュニケーション設計
# エンゲージメント向上策
# 組織変革ロードマップ（1年間）

URLやHTMLタグは使わないでください。`,
};

export async function POST(req: NextRequest) {
  const { content, strategyType } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 55000);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4000,
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
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

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

        for (const line of text.split('\n')) {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'text', content: line + '\n' })}\n\n`
          ));
          await new Promise(r => setTimeout(r, 5));
        }
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
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
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
