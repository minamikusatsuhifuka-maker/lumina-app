#!/usr/bin/env node
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RULES.md 整合性チェック（指示書233①）
//   node scripts/rules-lint.mjs   /   npm run rules:lint
//
// 目的: ルールが増えたときの「矛盾・重複」を、便の冒頭に機械で洗う。
// 判定はすべて文字列ベース（AI呼び出しなし）。落とすのは構造エラーのみで、
// 類似ルールは警告どまり（誤検出で運用が止まる方が害＝R-26と同じ考え方）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATEGORIES = ['パーサ', 'E2E', 'デプロイ', 'UI', 'データ', 'コンテンツ', '運用'];
const SIMILARITY_THRESHOLD = 0.55; // 同一分類内で見出しがこれ以上似ていたら重複候補

/** 見出し行から比較用のトークン集合を作る（記号・助詞・定型語を落とす） */
const STOP = new Set([
  'する', 'しない', 'こと', 'ため', 'よう', 'もの', 'から', 'まで', 'ない', 'ある',
  'その', 'この', 'これ', 'それ', 'など', 'また', 'として', 'による', 'つけない', '使う',
]);

function tokenize(title) {
  const normalized = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[（）()「」『』【】・、。，．,.:：;；/／\\|｜＋+*=＝<>＜＞"'`~〜ー–—-]/g, ' ');
  const tokens = new Set();
  // 英数字・記号を含む識別子（robustJsonParse, jsonb_set, book_meta 等）
  for (const m of normalized.matchAll(/[a-z0-9_.$[\]]{3,}/g)) tokens.add(m[0]);
  // 日本語は2〜4文字のn-gramではなく、漢字/カタカナの連続塊で拾う（過剰一致を避ける）
  for (const m of normalized.matchAll(/[一-鿿]{2,}|[゠-ヿ]{3,}/g)) {
    if (!STOP.has(m[0])) tokens.add(m[0]);
  }
  return tokens;
}

/** Jaccard係数 */
function similarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function parseRules(md) {
  const rules = [];
  const lines = md.split('\n');
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const head = /^##\s+(R-\d+):\s*(.+)$/.exec(line);
    if (head) {
      if (current) rules.push(current);
      current = { id: head[1], title: head[2].trim(), line: i + 1, fields: {} };
      continue;
    }
    if (line.startsWith('## ') && current) {
      rules.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const field = /^-\s*(分類|背景|検証|初出):\s*(.+)$/.exec(line);
    if (field) current.fields[field[1]] = field[2].trim();
  }
  if (current) rules.push(current);
  return rules;
}

const md = readFileSync(join(ROOT, 'RULES.md'), 'utf8');
const rules = parseRules(md);
const errors = [];
const warnings = [];

if (rules.length === 0) errors.push('RULES.md からルールを1件も検出できませんでした（見出し形式 "## R-NN: ..." を確認）');

// ── 構造チェック ──
const seenIds = new Map();
for (const r of rules) {
  for (const key of ['分類', '背景', '検証', '初出']) {
    if (!r.fields[key]) errors.push(`${r.id} (L${r.line}): 「${key}」の行がありません`);
  }
  const cat = r.fields['分類'];
  if (cat && !CATEGORIES.includes(cat)) {
    errors.push(`${r.id} (L${r.line}): 分類「${cat}」は未定義です（許可: ${CATEGORIES.join('|')}）`);
  }
  if (seenIds.has(r.id)) errors.push(`${r.id} (L${r.line}): 番号が重複しています（初出 L${seenIds.get(r.id)}）`);
  else seenIds.set(r.id, r.line);
}

// ── 番号の連番チェック（欠番は再利用しない運用のため、飛びは警告どまり） ──
const nums = rules.map((r) => Number(r.id.slice(2))).sort((a, b) => a - b);
for (let i = 1; i < nums.length; i++) {
  if (nums[i] - nums[i - 1] > 1) warnings.push(`R-${String(nums[i - 1]).padStart(2, '0')} と R-${String(nums[i]).padStart(2, '0')} の間に欠番があります（削除済みなら再利用しないこと）`);
}

// ── 同一分類内の類似ルール検出（重複・矛盾の候補） ──
const byCategory = new Map();
for (const r of rules) {
  const cat = r.fields['分類'] ?? '(未分類)';
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat).push({ ...r, tokens: tokenize(r.title) });
}
for (const [cat, list] of byCategory) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const score = similarity(list[i].tokens, list[j].tokens);
      if (score >= SIMILARITY_THRESHOLD) {
        warnings.push(
          `[${cat}] ${list[i].id} と ${list[j].id} が類似（${score.toFixed(2)}）— 統合できないか確認\n` +
            `    ${list[i].id}: ${list[i].title}\n` +
            `    ${list[j].id}: ${list[j].title}`,
        );
      }
    }
  }
}

// ── 出力 ──
console.log(`RULES.md: ${rules.length}件のルール`);
for (const [cat, list] of [...byCategory].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${cat}: ${list.length}件`);
}
if (warnings.length > 0) {
  console.log(`\n⚠️  重複・矛盾の候補 ${warnings.length}件（判断は人間が行う）`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length > 0) {
  console.error(`\n❌ 形式エラー ${errors.length}件`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\n✅ 形式エラーなし');
