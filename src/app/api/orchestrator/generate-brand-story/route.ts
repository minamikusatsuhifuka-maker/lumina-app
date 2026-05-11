import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const persona = safeStr(body.persona);
  const marketResearch = safeStr(body.marketResearch);
  return `「${topic}」のブランドストーリーをヒーローズジャーニーの構造で作成してください。

【ターゲット】${persona.slice(0, 400)}
【市場背景】${marketResearch.slice(0, 400)}

## ブランドストーリー（ヒーローズジャーニー）

### 1. 日常世界（Before）読者の現在の状況
### 2. 冒険への召喚（気づき・きっかけ）
### 3. 試練・葛藤（問題・障害）
### 4. メンター・解決策（あなたのサービスとの出会い）
### 5. 変容（After）どう変わったか
### 6. 帰還と貢献（読者へのメッセージ）

## 使用場面別バリエーション
- LP冒頭用（300字）
- SNSプロフィール用（100字）
- 動画オープニング用（60字）`;
}, 4000);
