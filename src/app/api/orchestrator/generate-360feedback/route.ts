import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const memberInfo = body.memberInfo ?? {};
  const evaluation = safeStr(body.evaluation);
  return `以下の対象者について、360度フィードバック質問票を作成してください。

【対象者】
${JSON.stringify(memberInfo)}

【評価シート概要】
${evaluation.slice(0, 800)}

## 360度フィードバック質問票

### 上司向け質問（5問・5段階評価＋コメント）
### 同僚向け質問（5問・5段階評価＋コメント）
### 部下/後輩向け質問（5問・5段階評価＋コメント）
### 自己評価向け質問（5問・5段階評価＋コメント）

各質問は具体的な行動・観察可能な事象に焦点を当ててください。
最後に「フィードバック実施手順」と「結果の読み解き方」を簡潔に記載してください。`;
}, 3500);
