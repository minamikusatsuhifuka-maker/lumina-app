import { makeClaudeJsonHandler, safeStr } from '@/lib/orchestratorClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = makeClaudeJsonHandler((body) => {
  const topic = safeStr(body.topic);
  const outline = safeStr(body.outline);
  const targetReader = safeStr(body.targetReader);
  return `以下の書籍のAmazon Kindle商品ページ用の説明文を作成してください。

【書籍タイトル】${topic}
【目次概要】${outline.slice(0, 800)}
【ターゲット読者ヒント】${targetReader.slice(0, 500)}

## Amazon商品説明文（HTMLタグ使用可: <b>, <br>, <ul>, <li>）

1. 読者の悩みへの共感（1段落・150〜200字）
2. この本で得られるもの（箇条書き5〜7点・各30字以内）
3. 著者の権威性（1段落・100〜150字）
4. 限定性・社会的証明
5. CTA文（1段落・「今すぐ」「期間限定」等の行動喚起）

SEOキーワードを自然に含めてください。
最後に「推奨キーワード（KDP登録用7個）」も提示してください。`;
}, 4000);
