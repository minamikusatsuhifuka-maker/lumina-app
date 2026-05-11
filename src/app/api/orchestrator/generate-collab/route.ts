import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const brandStory = safeStr(body.brandStory);
  const persona = safeStr(body.persona);
  return `「${topic}」のインフルエンサー協業・JV戦略を作成してください。

【ブランドストーリー】${brandStory.slice(0, 500)}
【ターゲット】${persona.slice(0, 400)}

## コラボ・JV戦略

### 理想的なコラボ相手の条件
フォロワー数・属性・親和性等の指標

### アプローチメール文（DM・メール）
件名・本文・PS文

### コラボ企画案（3パターン）
1. ウェビナー共催案：構成・収益分配
2. 相互プロモーション案：メルマガ・SNS連携
3. 共同商品開発案：商品設計・分配

### JV条件・収益分配の設計
契約書ベースのテンプレート

### コラボ後のフォローアップ
関係性継続のフロー`;
}, 3500);
