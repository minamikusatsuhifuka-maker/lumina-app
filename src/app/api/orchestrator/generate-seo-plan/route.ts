import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const marketResearch = safeStr(body.marketResearch);
  const persona = safeStr(body.persona);
  return `「${topic}」のSEOコンテンツ年間計画を作成してください。

【市場リサーチ】${marketResearch.slice(0, 500)}
【ターゲット】${persona.slice(0, 400)}

## SEO年間コンテンツカレンダー

### 月次テーマ（12ヶ月分）
1月〜12月のテーマと目的

### キーワード戦略
- ビッグキーワード5個
- ミドルキーワード5個
- ロングテール5個

### 記事カテゴリ設計（5カテゴリ）
カテゴリ名・該当キーワード群

### 月4本の記事タイトル案
1月〜3月分を詳細に48タイトル（タイトル＋狙うキーワード）

### 内部リンク設計
ハブ＆スポーク構造

### 被リンク獲得戦略
取材依頼・ゲスト寄稿・共同コンテンツ案`;
}, 4500);
