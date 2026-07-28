// 192③: 旧カテゴリ → 正規カテゴリのマージ移行（AI不使用の機械変換）。
// 対象: text_analysis_saves.folder / context_saves.category
//
// 使い方（DATABASE_URL を環境変数で渡す。Node 24 の type stripping で TS 語彙を直接 import）:
//   node --env-file=<envファイル> scripts/migrate-192-categories.mjs            # ドライラン（既定・書き込みなし）
//   node --env-file=<envファイル> scripts/migrate-192-categories.mjs --execute  # 実行（旧値を *_before_192 に退避してから変換）
//
// ロールバック（手動SQL）:
//   UPDATE text_analysis_saves SET folder   = folder_before_192   WHERE folder_before_192 IS NOT NULL;
//   UPDATE context_saves       SET category = category_before_192 WHERE category_before_192 IS NOT NULL;

import { neon } from '@neondatabase/serverless';
import {
  CATEGORY_MERGE_MAP,
  CANONICAL_CATEGORIES,
  SYSTEM_CATEGORIES,
} from '../src/lib/category-vocabulary.ts';

const execute = process.argv.includes('--execute');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL がありません（--env-file で渡してください）');
  process.exit(1);
}
const sql = neon(url);

// 未分類はそのまま維持（text_analysis_saves: '' / context_saves: 'general'）
const KEEP_AS_IS = new Set(['', 'general', ...CANONICAL_CATEGORIES, ...SYSTEM_CATEGORIES]);

async function analyzeTable(table, column) {
  const rows = await sql.query(
    `SELECT COALESCE(${column}, '') AS c, COUNT(*)::int AS n FROM ${table} GROUP BY 1 ORDER BY 2 DESC`,
  );
  const after = new Map();
  const changes = [];
  const unmapped = [];
  for (const { c, n } of rows) {
    let target = c;
    if (!KEEP_AS_IS.has(c)) {
      const mapped = CATEGORY_MERGE_MAP[c];
      if (mapped) {
        target = mapped;
        changes.push({ old: c, next: mapped, n });
      } else {
        unmapped.push({ c, n });
      }
    }
    after.set(target, (after.get(target) ?? 0) + n);
  }
  return { rows, after, changes, unmapped };
}

function printDistribution(title, map) {
  console.log(`\n--- ${title} ---`);
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => console.log(`${String(n).padStart(5)}  ${c || '(未分類)'}`));
}

for (const [table, column] of [
  ['text_analysis_saves', 'folder'],
  ['context_saves', 'category'],
]) {
  const { after, changes, unmapped } = await analyzeTable(table, column);
  console.log(`\n=============== ${table}.${column} ===============`);
  console.log(`変換対象: ${changes.reduce((s, c) => s + c.n, 0)}件 / ${changes.length}種`);
  for (const ch of changes) console.log(`  ${ch.old} → ${ch.next}（${ch.n}件）`);
  if (unmapped.length > 0) {
    console.log(`⚠️ 未マップ（変換されず残る）:`);
    for (const u of unmapped) console.log(`  ${u.c}（${u.n}件）`);
  } else {
    console.log('未マップ: なし（全種カバー）');
  }
  printDistribution(`${execute ? '実行後' : 'ドライラン: 適用後'}のカテゴリ別件数`, after);

  if (execute) {
    const backupCol = `${column}_before_192`;
    await sql.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${backupCol} TEXT`);
    // 退避は「まだ退避していない行」だけ（再実行しても元の旧値を上書きしない＝冪等）
    await sql.query(
      `UPDATE ${table} SET ${backupCol} = ${column} WHERE ${backupCol} IS NULL AND COALESCE(${column}, '') <> ''`,
    );
    let updated = 0;
    for (const ch of changes) {
      const r = await sql.query(
        `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2 RETURNING id`,
        [ch.next, ch.old],
      );
      updated += r.length;
    }
    console.log(`✅ ${table}: ${updated}件を変換（旧値は ${backupCol} に退避済み）`);
  }
}

if (!execute) {
  console.log('\n（ドライラン: 書き込みは行っていません。実行は --execute を付与）');
}
