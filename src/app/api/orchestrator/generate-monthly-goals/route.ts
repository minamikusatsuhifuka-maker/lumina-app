import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const memberInfo = body.memberInfo ?? {};
  const roadmap = safeStr(body.roadmap);
  return `以下の対象者の月次目標シートを12ヶ月分作成してください。

【対象者】
${JSON.stringify(memberInfo)}

【成長ロードマップ】
${roadmap.slice(0, 1000)}

## 月次目標シート（12ヶ月）

### 1ヶ月目
- 達成目標（定量）：
- 行動目標（定性）：
- 指導者の関わり：
- 振り返り観点：

（以下、2〜12ヶ月目まで同じフォーマットで具体的に）

各月のテーマを明確にし、前月から段階的に発展する設計にしてください。`;
}, 4000);
