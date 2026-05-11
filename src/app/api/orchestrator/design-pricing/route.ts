import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const persona = safeStr(body.persona);
  const competitorAnalysis = safeStr(body.competitorAnalysis);
  return `「${topic}」の価格戦略を設計してください。

ターゲット: ${persona.slice(0, 400)}
競合分析: ${competitorAnalysis.slice(0, 400)}

## 価格戦略

### 心理的価格設定（アンカリング効果を活用）

### 推奨料金プラン（3段階）
| プラン名 | 価格 | 内容 | ターゲット |
|---------|------|------|----------|

### 価格の正当化（なぜこの価格が適切か）

### 値上げのタイミングとロードマップ`;
}, 3500);
