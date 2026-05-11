import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const kpiSheet = safeStr(body.kpiSheet);
  const pricingStrategy = safeStr(body.pricingStrategy);
  return `「${topic}」のROI・月収シミュレーションを作成してください。

【KPI設計】${kpiSheet.slice(0, 500)}
【価格戦略】${pricingStrategy.slice(0, 500)}

## ROIシミュレーション

### 初期投資コスト（時間・資金）
具体的な内訳

### 月次収益シミュレーション（3パターン）
| 月 | 保守的 | 標準的 | 楽観的 |
|----|--------|--------|--------|
| 1ヶ月目 | | | |
| 3ヶ月目 | | | |
| 6ヶ月目 | | | |
| 12ヶ月目 | | | |

### 損益分岐点（BEP）の計算
具体的な月数・必要な顧客数

### 12ヶ月累計収益予測

### 時間単価の計算（週1〜2時間稼働の場合）
副業として見た時の時給換算`;
}, 3500);
