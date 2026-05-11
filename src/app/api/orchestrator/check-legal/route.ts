import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const content = safeStr(body.content);
  const procedureName = safeStr(body.procedureName);
  return `以下の医療同意書を法的・倫理的観点でレビューしてください。
インフォームドコンセントの7要素（情報開示・理解・自発性・能力・同意）が揃っているか確認し、
不足・改善点を指摘してください。

【施術名】
${procedureName}

【同意書内容】
${content}

## レビュー結果
### ✅ 適切に記載されている項目
### ⚠️ 改善が必要な項目
### 📝 追記推奨の内容
### 総合評価（A/B/C/D）`;
});
