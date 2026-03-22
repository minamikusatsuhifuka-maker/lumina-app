import { NextRequest } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { content, title, presentationType } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const encoder = new TextEncoder();

  const prompts: Record<string, string> = {
    business: `あなたはプレゼンテーション設計の専門家です。
以下の情報をGensparkで最高のプレゼン資料を作成するための構成に変換してください。

【出力形式】Gensparkのプロンプトとして最適なMarkdown形式で出力してください。

# プレゼンタイトル
（インパクトのある短いタイトル）

## スライド構成（10〜15枚）

### スライド1: タイトルスライド
- タイトル：
- サブタイトル：
- キービジュアルのイメージ：

### スライド2: エグゼクティブサマリー
- 3つの核心メッセージ：
- 結論/提言：

### スライド3〜N: [各セクション]
各スライドに：
- スライドタイトル
- 主要メッセージ（1文）
- 箇条書きポイント（3〜5個）
- 推奨するビジュアル（グラフ/図/表）
- データ・数値（あれば）

### 最終スライド: まとめ・アクション
- 3つの重要ポイント
- 次のアクション
- CTA

【デザイン指定】
- カラースキーム：プロフェッショナル（紺・白・アクセント）
- フォント：モダン・読みやすい
- レイアウト：データビジュアル重視`,

    research: `あなたはリサーチレポートのプレゼン専門家です。
以下のリサーチ内容をGensparkで最適なリサーチ報告プレゼンに変換してください。

# リサーチ報告プレゼン構成

## スライド構成（8〜12枚）

### スライド1: リサーチ概要
- 調査テーマ・目的
- 調査方法・期間
- 主要な発見

### スライド2: 市場・環境概況
- 現状のデータと数値
- トレンドの方向性
- 推奨ビジュアル：折れ線グラフ・市場規模図

### スライド3〜6: 主要発見（各テーマ）
- 発見1〜4の詳細
- エビデンス・データ
- 示唆・インプリケーション

### スライド7: 課題・リスク
- 特定された課題
- リスクマトリクス

### スライド8: 提言・アクション
- 優先度別アクション
- 実行タイムライン

【デザイン指定】
- データビジュアル重視
- グラフ・チャート多用
- シンプル・クリーンなデザイン`,

    strategy: `あなたは経営戦略プレゼンの専門家です。
以下の戦略内容をGensparkで最適な経営戦略プレゼンに変換してください。

# 経営戦略プレゼン構成

## スライド構成（12〜15枚）

### スライド1: 戦略タイトル・ビジョン
- 戦略タイトル（力強いメッセージ）
- ビジョン・方向性

### スライド2: 現状分析
- 現状の課題（3点）
- 機会（3点）
- SWOT視点

### スライド3: 戦略の全体像
- 3〜5つの戦略柱
- 各柱の概要
- 推奨ビジュアル：ピラミッド図・フレームワーク図

### スライド4〜8: 各戦略詳細
- 戦略の目的・背景
- 具体的施策
- KPI・成功指標
- 必要リソース

### スライド9: 実行ロードマップ
- フェーズ別スケジュール（ガントチャート形式）
- マイルストーン

### スライド10: 期待される成果
- 定量目標（数値）
- 定性目標
- リスクと対策

### スライド11: 組織・体制
- 推進体制
- 役割分担

### スライド12: 次のアクション
- 即座に実行すべき3つのこと
- 意思決定ポイント

【デザイン指定】
- エグゼクティブ向け・権威あるデザイン
- 図表・フレームワーク重視
- 余白を活かしたクリーンレイアウト`,

    pitch: `あなたはスタートアップのピッチデック専門家です。
以下の情報をGensparkで最適な投資家向けピッチデック構成に変換してください。

# 投資家向けピッチデック構成（Genspark用）

## スライド構成（10〜12枚）

### スライド1: カバー
- 会社名・サービス名
- 一言でわかるサービス説明
- ビジュアルイメージ

### スライド2: 解決する課題
- ターゲットの課題（大きな問題提起）
- 市場の痛み
- 現状の解決策の限界

### スライド3: ソリューション
- LUMINAのアプローチ
- デモ・スクリーンショット
- 差別化ポイント

### スライド4: 市場規模
- TAM・SAM・SOM
- 市場成長率
- 推奨ビジュアル：円グラフ・市場規模図

### スライド5: ビジネスモデル
- 収益モデル（Free/Pro）
- 価格設定の根拠
- ユニットエコノミクス

### スライド6: トラクション
- 現在の実績・数値
- 成長率
- 推奨ビジュアル：折れ線グラフ

### スライド7: 競合比較
- 競合マトリクス
- 差別化要素
- 推奨ビジュアル：ポジショニングマップ

### スライド8: チーム
- 主要メンバー
- 強み・実績

### スライド9: ロードマップ
- 6ヶ月・1年・3年計画

### スライド10: 資金調達
- 調達額・用途
- マイルストーン

【デザイン指定】
- モダン・スタートアップらしい
- 数字・データを大きく強調
- インパクト重視`,
  };

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
            system: prompts[presentationType] || prompts.business,
            messages: [{
              role: 'user',
              content: `以下の内容をGensparkで最高のプレゼン資料を作成するための構成に変換してください。
具体的・実用的な内容で、各スライドのポイントを明確に記載してください。

【タイトル】${title}

【内容】
${content}

GensparkのAIが理解しやすい、具体的なスライド構成と内容を日本語で出力してください。`,
            }],
          }),
        });

        const data = await response.json();
        const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');

        for (const line of text.split('\n')) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: line + '\n' })}\n\n`));
          await new Promise(r => setTimeout(r, 5));
        }
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
      } catch (e: any) {
        controller.enqueue(encoder.encode(`data: {"type":"error","message":"${e.message}"}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
