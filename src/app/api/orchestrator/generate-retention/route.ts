import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const communityDesign = safeStr(body.communityDesign);
  return `「${topic}」のリテンション・解約防止戦略を作成してください。

【コミュニティ設計】${communityDesign.slice(0, 600)}

## リテンション戦略

### 解約リスクの早期検知指標
ログイン頻度・利用時間・課題進捗等の閾値

### 解約防止メールシーケンス（解約申請時）
件名・本文・引き止めオファー

### ウィンバック施策
- 解約後30日のメール
- 解約後60日のメール
- 解約後90日のメール

### 継続率向上のための月次施策カレンダー
毎月のアクティベーション施策

### LTV最大化のための特典・コンテンツ設計
年間で見た時の価値提供`;
}, 3500);
