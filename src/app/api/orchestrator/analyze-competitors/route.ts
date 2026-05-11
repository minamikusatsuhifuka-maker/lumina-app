import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const marketResearch = safeStr(body.marketResearch);
  return `「${topic}」市場の競合を分析してください。
${marketResearch ? `\n市場情報: ${marketResearch.slice(0, 800)}\n` : ''}

## 競合分析

### 主要競合（3〜5社/サービス）
| 競合名 | 強み | 弱み | 価格帯 |
|--------|------|------|--------|

### 市場のギャップ（未充足ニーズ）

### 差別化のチャンス

### 参入タイミングの評価`;
}, 3500);
