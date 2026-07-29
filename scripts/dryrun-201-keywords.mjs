// 201: キーワード方式カテゴリ抽出のドライラン（読み取り専用・書き込みなし）。
// ヒット件数・タイトルサンプル・ILIKE所要時間を実測して報告するためのスクリプト。
//
// 使い方（migrate-192-categories.mjs と同じ --env-file 方式）:
//   node --env-file=.env.local scripts/dryrun-201-keywords.mjs            # タイトルのみ（既定）
//   node --env-file=.env.local scripts/dryrun-201-keywords.mjs --body     # 本文も検索

import { neon } from '@neondatabase/serverless';
import {
  CATEGORY_KEYWORDS,
  isWordBoundaryKeyword,
  toIlikePattern,
  toWordBoundaryPattern,
} from '../src/lib/category-keywords.ts';

const includeBody = process.argv.includes('--body');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL がありません（--env-file で渡してください）');
  process.exit(1);
}
const sql = neon(url);

const TABLES = {
  ta: {
    name: 'text_analysis_saves',
    title: `COALESCE(NULLIF(auto_title, ''), NULLIF(file_name, ''), '無題')`,
    current: `COALESCE(folder, '')`,
    body: ['content'],
  },
  ctx: {
    name: 'context_saves',
    title: `COALESCE(NULLIF(topic, ''), '無題')`,
    current: `COALESCE(category, 'general')`,
    body: ['context_text', `COALESCE(research_text, '')`],
  },
};

const totals = {};
for (const [key, t] of Object.entries(TABLES)) {
  const rows = await sql.query(`SELECT COUNT(*)::int AS n FROM ${t.name}`);
  totals[key] = rows[0].n;
}
console.log(
  `対象全件: text_analysis_saves=${totals.ta}件 / context_saves=${totals.ctx}件（合計${totals.ta + totals.ctx}件）`,
);
console.log(`検索範囲: ${includeBody ? 'タイトル＋本文' : 'タイトルのみ（既定）'}\n`);

const started = Date.now();
// key = `${table}:${id}`（APIのプレビューと同じマージ規則: 先勝ち=辞書の先頭カテゴリ優先）
const merged = new Map();
for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
  for (const kw of keywords) {
    const boundary = isWordBoundaryKeyword(kw);
    const op = boundary ? '~*' : 'ILIKE';
    const p = boundary ? toWordBoundaryPattern(kw) : toIlikePattern(kw);
    for (const [key, t] of Object.entries(TABLES)) {
      const bodyCond = includeBody
        ? t.body.map((c) => ` OR ${c} ${op} $1`).join('')
        : '';
      const rows = await sql.query(
        `SELECT id, ${t.title} AS title, ${t.current} AS current
         FROM ${t.name}
         WHERE ${t.current} <> $2 AND (${t.title} ${op} $1${bodyCond})`,
        [p, category],
      );
      for (const r of rows) {
        const mkey = `${key}:${r.id}`;
        const prev = merged.get(mkey);
        if (prev) {
          if (!prev.keywords.includes(kw)) prev.keywords.push(kw);
        } else {
          merged.set(mkey, {
            table: key,
            title: r.title,
            current: r.current === 'general' ? '(未分類)' : r.current || '(未分類)',
            category,
            keywords: [kw],
          });
        }
      }
    }
  }
}
const elapsed = Date.now() - started;

const hits = [...merged.values()];
for (const category of Object.keys(CATEGORY_KEYWORDS)) {
  const list = hits.filter((h) => h.category === category);
  console.log(`\n=== ${category}: ${list.length}件 ===`);
  for (const h of list.slice(0, 12)) {
    console.log(
      `  [${h.table}] ${String(h.title).slice(0, 60)} ｜ ${h.current} → ${category} ｜ 一致: ${h.keywords.join(',')}`,
    );
  }
  if (list.length > 12) console.log(`  ...ほか${list.length - 12}件`);
}
console.log(`\n所要時間（全キーワード×両テーブル検索の合計）: ${elapsed}ms`);
console.log('（ドライラン: 書き込みは一切行っていません）');
