import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const amazonListing = safeStr(body.amazonListing);
  return `「${topic}」のKindle書籍出版後のレビュー獲得戦略を作成してください。

【Amazon説明文】
${amazonListing.slice(0, 800)}

## レビュー獲得戦略

### 出版前（ARC: 事前レビュアー獲得）
- ターゲット読者の見つけ方
- 依頼メール文面

### 出版当日のメール文（読者向け）
- 件名候補3つ
- 本文（読者の感謝→レビュー依頼→具体的な方法）

### SNS投稿案（3パターン）
- X/Twitter
- Instagram
- note

### レビュー依頼フォローアップメール
- 出版後3日、7日、14日のメール文

### 低評価への対応方針
- 公開対応のガイドライン
- 改善への活用方法`;
}, 3500);
