import { makeClaudeJsonHandler, safeStr, safeNum } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const researchText = safeStr(body.researchText);
  const count = safeNum(body.count, 10);
  const type = safeStr(body.type, 'faq');
  const isObjections = type === 'objections';

  if (isObjections) {
    return `「${topic}」の購入・導入を検討している人が持つ反論・疑問・不安を${count}個生成し、
それぞれに対する説得力ある回答を作成してください。

${researchText ? `\n参考情報:\n${researchText.slice(0, 1000)}\n` : ''}

形式：
Q: （反論・不安）
A: （共感→理由→証拠→行動を促す回答）`;
  }
  return `「${topic}」についてよくある質問と回答を${count}個生成してください。
${researchText ? `\n参考情報:\n${researchText.slice(0, 1000)}` : ''}

形式：
Q: （質問）
A: （わかりやすく簡潔な回答）`;
}, 4000);
