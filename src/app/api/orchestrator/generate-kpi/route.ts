import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const pricingStrategy = safeStr(body.pricingStrategy);
  return `「${topic}」の収益化KPIシートを設計してください。

【価格戦略】${pricingStrategy.slice(0, 500)}

## KPI設計シート

### 月次売上目標（3ヶ月・6ヶ月・12ヶ月）
具体的な数値目標を提示

### 主要KPI一覧
| KPI | 定義 | 目標値 | 測定方法 | 改善施策 |
|-----|------|--------|---------|---------|

### ファネル指標
認知 → リード獲得 → CV率 → 平均顧客単価 → LTV

### 週次モニタリング項目（5項目）
毎週確認すべき指標

### アラートライン
要改善の閾値・アクション内容`;
}, 3500);
