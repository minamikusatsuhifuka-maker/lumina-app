import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const lpContent = safeStr(body.lpContent);
  const pricingStrategy = safeStr(body.pricingStrategy);
  return `「${topic}」のアップセル・クロスセル設計をしてください。

【LP内容】${lpContent.slice(0, 600)}
【価格戦略】${pricingStrategy.slice(0, 500)}

## アップセル設計

### 商品ラダー設計
| 段階 | 商品名 | 価格帯 | 内容 | 提案タイミング |
|------|--------|-------|------|--------------|
| フロントエンド | | | | |
| ミドル | | | | |
| バックエンド | | | | |

### アップセルのタイミングと方法
- 購入直後のOTO（ワンタイムオファー）の文面
- 使用後30日のアップセルメール
- コミュニティ内でのクロスセル

### アップセル率を上げる心理設計
- 一貫性の原理
- 損失回避
- 希少性`;
}, 3500);
