import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const outline = safeStr(body.outline);
  return `以下の書籍目次の各章について、読者を引き込む冒頭フック文を生成してください。

【書籍テーマ】${topic}

【目次】
${outline.slice(0, 1500)}

各章のフック文は：
- 衝撃的な事実・数字、または
- 感情に訴えるエピソード、または
- 問いかけ

で始まる2〜4文で作成してください。
読者が「次を読まずにはいられない」と感じる導入を意識してください。`;
}, 4000);
