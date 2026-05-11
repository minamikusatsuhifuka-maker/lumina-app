import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const amazonListing = safeStr(body.amazonListing);
  return `「${topic}」の出版前後30日間のプロモーション計画を作成してください。

【Amazon説明文】
${amazonListing.slice(0, 600)}

## 30日間プロモーションカレンダー

### 出版30日前〜前日：予告・期待醸成
- 各日の具体的アクション
- SNS投稿のテーマ・サンプル文
- メルマガ・LINE配信内容

### 出版当日：最大集客
- ローンチタイムライン（朝〜夜）
- SNS連投スケジュール
- メール配信
- 既存顧客への声かけ

### 出版後1週間：初速獲得
- レビュー獲得施策
- インフルエンサー連携案
- 値引きキャンペーン検討

### 出版後2〜4週間：維持・拡大
- 関連コンテンツ投稿
- 別チャネル展開（YouTube動画化等）
- 次回作への導線

各フェーズに「KPI」と「成功の見極めポイント」を含めてください。`;
}, 4000);
