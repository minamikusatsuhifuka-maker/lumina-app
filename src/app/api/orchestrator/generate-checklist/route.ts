import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const lpContent = safeStr(body.lpContent);
  const stepMailContent = safeStr(body.stepMailContent);
  return `「${topic}」のローンチに向けた完全チェックリストを作成してください。

【LP内容】${lpContent.slice(0, 500)}
【ステップメール】${stepMailContent.slice(0, 500)}

## ローンチチェックリスト

### 📋 ローンチ1ヶ月前
- [ ] 項目（担当・期限）

### 📋 ローンチ1週間前
- [ ] ...

### 📋 ローンチ前日
- [ ] ...

### 📋 ローンチ当日
- [ ] ...

### 📋 ローンチ後1週間
- [ ] ...

各項目には担当者・期限の例を含めてください。`;
}, 3500);
