import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const persona = safeStr(body.persona);
  return `「${topic}」のバイヤーズジャーニーマップを設計してください。

【ターゲット】${persona.slice(0, 400)}

## バイヤーズジャーニーマップ
| ステージ | 認知 | 興味・調査 | 比較・検討 | 購買決定 | 継続・推薦 |
|--------|------|---------|---------|---------|---------|
| 顧客の状態 | | | | | |
| 疑問・不安 | | | | | |
| 接触チャネル | | | | | |
| コンテンツ戦略 | | | | | |
| CTAとオファー | | | | | |

## 各ステージの重点施策
各ステージで使う具体的なコンテンツ・CTA・施策を箇条書きで列挙してください。

## ボトルネックの検知ポイント
どこで離脱が起こりやすいか・改善のヒント`;
}, 4000);
