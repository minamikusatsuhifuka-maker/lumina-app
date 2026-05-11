import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const upsellDesign = safeStr(body.upsellDesign);
  const persona = safeStr(body.persona);
  return `「${topic}」のコミュニティ・メンバーシップ設計をしてください。

【アップセル設計】${upsellDesign.slice(0, 600)}
【ターゲット】${persona.slice(0, 400)}

## コミュニティ設計

### コミュニティの目的・価値提案
なぜ参加すべきかを1〜2行で

### オンボーディング設計（入会後7日間）
Day1〜Day7の具体的な体験設計

### 月次コンテンツカレンダー
週次・月次の定期コンテンツ案

### エンゲージメント施策（ゲーミフィケーション）
バッジ・ランキング・チャレンジ等

### 解約防止の仕組み
継続したくなる仕組み

### 段階的なレベルアップ設計
初級→中級→上級のラダー`;
}, 3500);
