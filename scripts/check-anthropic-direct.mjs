#!/usr/bin/env node
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anthropic 直叩きの検出（指示書242④・再発防止）
//
// 背景: 235でフォールバック共通層を作ったが、Anthropicを直接叩くルートが109本残り、
// 241の利用上限到達でそれらが全滅した。「数えて報告する」（R-41）だけでは、
// 新しいルートを足したときに同じ状態へ戻る。検出を機械化してビルドで止める。
//
// 使い方: npm run check:anthropic （prebuild から自動実行される）
// 違反があれば exit 1 でビルドを落とす。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

// 共通層自身は「Anthropicを直接呼ぶのが正しい」ので対象外
const ALLOWLIST = new Set([
  'lib/anthropic-compat.ts', // フォールバック互換シム（ここが唯一の入口）
  'lib/ai-fallback.ts', // Claude→Gemini 切替の共通層
  'lib/ai-client.ts', // generateWithModel / streamWithModel
  'lib/call-ai.ts', // callAI
]);

const RULES = [
  {
    // anthropicFetch( は共通層経由なので除外する（直前が識別子文字でない fetch だけを見る）
    re: /(?<![A-Za-z0-9_$])fetch\s*\(\s*['"`]https:\/\/api\.anthropic\.com/g,
    msg: "Anthropic を fetch で直接叩いています → `anthropicFetch(` に置き換えてください（@/lib/anthropic-compat）",
  },
  {
    re: /from\s+['"]@anthropic-ai\/sdk['"]/g,
    msg: 'Anthropic SDK を直接使っています → `createAnthropicClient()` に置き換えてください（@/lib/anthropic-compat）',
  },
  {
    re: /new\s+Anthropic\s*\(/g,
    msg: 'new Anthropic() は共通層を通りません → `createAnthropicClient()` を使ってください（@/lib/anthropic-compat）',
  },
];

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(SRC);

const violations = [];
for (const f of files) {
  const rel = path.relative(SRC, f).split(path.sep).join('/');
  if (ALLOWLIST.has(rel)) continue;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // コメント行は対象外（説明文に URL や識別子が出てくるため）
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      if (rule.re.test(line)) violations.push({ rel, line: i + 1, msg: rule.msg, code: line.trim().slice(0, 100) });
    }
  });
}

if (violations.length === 0) {
  console.log(`✅ Anthropic直叩きなし（${files.length}ファイル検査 / 共通層の例外 ${ALLOWLIST.size}件）`);
  process.exit(0);
}

console.error(`\n❌ Anthropic直叩きを ${violations.length}件 検出しました（242④）\n`);
for (const v of violations) {
  console.error(`  src/${v.rel}:${v.line}`);
  console.error(`    ${v.code}`);
  console.error(`    → ${v.msg}\n`);
}
console.error('共通層を通すと、上限・混雑時に自動でGeminiへ切り替わります（R-37）。');
console.error('意図的な例外は scripts/check-anthropic-direct.mjs の ALLOWLIST に理由付きで追加してください。\n');
process.exit(1);
