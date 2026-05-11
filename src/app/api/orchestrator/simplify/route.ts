import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const content = safeStr(body.content);
  const targetAudience = safeStr(body.targetAudience, '一般患者（医療知識なし）');
  return `以下の医療文書を、${targetAudience}が理解できる平易な言葉に変換してください。
専門用語には（）でわかりやすい説明を付けてください。

【元の文章】
${content}

変換後の文章を出力してください。`;
}, 4000);
