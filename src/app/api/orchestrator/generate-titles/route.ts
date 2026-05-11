import { makeClaudeJsonHandler, safeStr, safeNum } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const outline = safeStr(body.outline);
  const count = safeNum(body.count, 30);
  return `「${topic}」についてのKindle書籍のタイトル・サブタイトルを${count}案生成してください。

【目次概要】
${outline.slice(0, 1000)}

各案に：
- タイトル
- サブタイトル
- 訴求ポイント（なぜ売れそうか・心理学的根拠）

を含めてください。心理学要素（好奇心ギャップ・損失回避・社会的証明・希少性）を活用してください。

最後に「⭐ 特にお勧めTop3」を選定理由と共に提示してください。`;
}, 5000);
