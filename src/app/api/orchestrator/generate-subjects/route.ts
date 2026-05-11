import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const stepMailContent = safeStr(body.stepMailContent);
  const topic = safeStr(body.topic);
  return `以下のステップメールシーケンスの各メールに対して、
開封率を最大化する件名を3パターン（A/B/C）生成してください。

【テーマ】${topic}

【ステップメール内容】
${stepMailContent.slice(0, 3000)}

各メール（DayX）に対して：
- A案：好奇心ギャップを活用
- B案：損失回避バイアスを活用
- C案：社会的証明・希少性を活用

各案の心理的訴求ポイントを1行で説明してください。`;
}, 4000);
