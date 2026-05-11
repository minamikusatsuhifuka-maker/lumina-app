import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const persona = safeStr(body.persona);
  return `「${topic}」のお客様の声を集めるためのテンプレートを作成してください。

【ターゲット】${persona.slice(0, 400)}

## お客様の声テンプレート集

### レビュー依頼メール文
- 購入後3日
- 購入後7日
- 購入後30日

### アンケートフォーム設計（5問）
回答しやすい質問構成

### お客様の声の理想的な構成
ビフォーアフター形式のサンプル

### 事例インタビュー質問集（10問）
深掘り質問の構成

### SNSでシェアしてもらうためのテンプレート
ハッシュタグ・スクリーンショット用のフォーマット`;
}, 3500);
