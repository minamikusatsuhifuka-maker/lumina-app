import { NextRequest } from 'next/server';

export const maxDuration = 60;

const STRATEGY_PROMPTS: Record<string, string> = {

  mvv: `あなたは世界トップクラスの経営コンサルタントです。
以下の情報をもとに、企業のMission（使命）・Vision（ビジョン）・Values（価値観）を策定してください。

【出力形式】
# Mission（ミッション）
なぜ存在するのか。社会への約束。（1〜2文）

# Vision（ビジョン）
10年後に実現したい世界。（1〜2文）

# Values（バリュー）
行動指針となる価値観。（5〜7個、各1文で説明付き）

# ブランドスローガン案
MVVを凝縮した印象的なキャッチフレーズ（3案）

# MVV策定の意図・解説
なぜこのMVVにしたのか、ストーリーで説明`,

  philosophy: `あなたは企業理念・哲学の専門家です。
以下の情報をもとに、深みのある企業理念・経営哲学を策定してください。

【出力形式】
# 企業理念
創業者の想いと社会への約束（200字程度）

# 経営哲学
経営判断の根底にある考え方（5原則）

# クレド（行動信条）
全社員が日々実践する行動規範（10条）

# 理念浸透のための施策案
理念を組織に根付かせる具体的な施策（5つ）`,

  market_strategy: `あなたはマーケティング戦略の第一人者です。
以下の情報をもとに、包括的なマーケティング戦略を立案してください。

【出力形式】
# 市場分析
ターゲット市場の定義・規模・成長性

# STP分析
セグメンテーション・ターゲティング・ポジショニング

# 4P戦略
Product・Price・Place・Promotion の具体策

# デジタルマーケティング戦略
SNS・SEO・コンテンツ・広告の統合施策

# 90日間マーケティングロードマップ
優先度別の具体的なアクションプラン`,

  brand: `あなたはブランド戦略の専門家です。
以下の情報をもとに、強力なブランド戦略を立案してください。

【出力形式】
# ブランドアイデンティティ
ブランドの本質・約束・個性

# ターゲットペルソナ（3タイプ）
年齢・職業・価値観・悩み・購買行動

# ブランドボイス＆トーン
コミュニケーションの文体・雰囲気のガイドライン

# ブランドストーリー
共感を生む起源ストーリー（300字）

# コンテンツ戦略
ブランドを体現するコンテンツの方向性

# KPI設定
ブランド強化を測る指標と目標値`,

  hiring: `あなたは採用戦略・人事の専門家です。
以下の情報をもとに、採用戦略を包括的に立案してください。

【出力形式】
# 採用ペルソナ
求める人材像（スキル・マインド・経験・カルチャーフィット）

# 採用メッセージ
候補者の心に刺さる採用コピー（3パターン）

# 採用媒体・チャネル戦略
各媒体の特性と活用方法

# 選考フロー設計
各ステップの目的・評価基準・質問例

# 採用面接質問集
コンピテンシー別の面接質問（20問）

# オンボーディング設計
入社後30/60/90日の育成プラン`,

  talent: `あなたは人材育成・組織開発の専門家です。
以下の情報をもとに、人材育成・マネジメント戦略を立案してください。

【出力形式】
# 人材育成の基本方針
育成哲学と目指す人材像

# スキルマップ＆成長ステージ
職種別・レベル別の習得スキル定義

# 育成プログラム設計
OJT・OFF-JT・自己啓発の組み合わせ

# 1on1ミーティング設計
頻度・アジェンダ・マネージャーのスキル

# 評価制度設計
評価軸・評価方法・フィードバックの仕組み

# 最新マネジメント手法
心理的安全性・OKR・ティール組織等の活用法`,

  organization: `あなたは組織デザイン・組織開発の専門家です。
以下の情報をもとに、強い組織づくりの戦略を立案してください。

【出力形式】
# 組織診断
現状の強み・課題・リスク

# 組織設計原則
スケールするための組織構造の考え方

# カルチャー設計
心理的安全性・チームワーク・イノベーション文化の醸成

# コミュニケーション設計
情報共有・意思決定・会議設計の最適化

# エンゲージメント向上策
従業員満足度・定着率向上の具体施策

# 組織変革ロードマップ
1年間の組織強化スケジュール`,
};

export async function POST(req: NextRequest) {
  const { content, strategyType } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;
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
            max_tokens: 4000,
            system: STRATEGY_PROMPTS[strategyType] || STRATEGY_PROMPTS.mvv,
            messages: [{
              role: 'user',
              content: `以下の情報をもとに分析・提案を作成してください。
情報が少ない場合は一般的なベストプラクティスを補完して提案してください。

【入力情報】
${content}

日本語で、具体的かつ実用的な内容を出力してください。`,
            }],
          }),
        });

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
