// 201: キーワード方式カテゴリ抽出のドライラン（読み取り専用・書き込みなし）。
// ヒット件数・タイトルサンプル・所要時間を実測して報告するためのスクリプト。
// 202: Tier A/B 2層判定に対応（Tier Bは Tier A との全文書共起が条件・単独では採用しない）。
//
// 使い方（migrate-192-categories.mjs と同じ --env-file 方式）:
//   node --env-file=.env.local scripts/dryrun-201-keywords.mjs            # タイトルのみ（既定）
//   node --env-file=.env.local scripts/dryrun-201-keywords.mjs --body     # 本文も検索
//   203: 任意ワードのドライラン（辞書を使わず指定ワードで検索・除外判定用に反映先カテゴリ指定）:
//   node --env-file=.env.local scripts/dryrun-201-keywords.mjs --words=選択理論 --target=選択理論

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

// APIルート（category-keyword-scan/route.ts）と同じ列定義・照合規則
const noSpace = (expr) => `REPLACE(REPLACE(${expr}, ' ', ''), '　', '')`;
const TABLES = {
  ta: {
    name: 'text_analysis_saves',
    titleExpr: `COALESCE(NULLIF(auto_title, ''), NULLIF(file_name, ''), '無題')`,
    titleSearchExpr: `COALESCE(NULLIF(auto_title, ''), file_name, '')`,
    bodyExprs: ['content'],
    currentExpr: `COALESCE(folder, '')`,
  },
  ctx: {
    name: 'context_saves',
    titleExpr: `COALESCE(NULLIF(topic, ''), '無題')`,
    titleSearchExpr: `COALESCE(topic, '')`,
    bodyExprs: ['context_text', `COALESCE(research_text, '')`],
    currentExpr: `COALESCE(category, 'general')`,
  },
};

function keywordCondition(kw, exprs) {
  const boundary = isWordBoundaryKeyword(kw);
  return exprs
    .map((e) => (boundary ? `${e} ~* $1` : `${noSpace(e)} ILIKE $1`))
    .join(' OR ');
}
const keywordPattern = (kw) =>
  isWordBoundaryKeyword(kw) ? toWordBoundaryPattern(kw) : toIlikePattern(kw);

async function searchKeyword(tableKey, category, kw, scopeBody) {
  const t = TABLES[tableKey];
  const exprs = scopeBody ? [t.titleSearchExpr, ...t.bodyExprs] : [t.titleSearchExpr];
  return sql.query(
    `SELECT id, ${t.titleExpr} AS title, ${t.currentExpr} AS current
     FROM ${t.name}
     WHERE ${t.currentExpr} <> $2 AND (${keywordCondition(kw, exprs)})`,
    [keywordPattern(kw), category],
  );
}

async function cooccurIds(tableKey, primaryKw, ids) {
  if (ids.length === 0) return new Set();
  const t = TABLES[tableKey];
  const exprs = [t.titleSearchExpr, ...t.bodyExprs]; // 共起チェックは常に全文書
  const rows = await sql.query(
    `SELECT id FROM ${t.name}
     WHERE id = ANY($2::integer[]) AND (${keywordCondition(primaryKw, exprs)})`,
    [keywordPattern(primaryKw), ids],
  );
  return new Set(rows.map((r) => Number(r.id)));
}

const totals = {};
for (const [key, t] of Object.entries(TABLES)) {
  const rows = await sql.query(`SELECT COUNT(*)::int AS n FROM ${t.name}`);
  totals[key] = rows[0].n;
}
console.log(
  `対象全件: text_analysis_saves=${totals.ta}件 / context_saves=${totals.ctx}件（合計${totals.ta + totals.ctx}件）`,
);
console.log(`検索範囲: ${includeBody ? 'タイトル＋本文' : 'タイトルのみ（既定）'}\n`);

// 203: 任意ワードモード（--words=）。辞書は使わず、APIの任意ワード検索と同じ規則で照合
const wordsArg = process.argv.find((a) => a.startsWith('--words='));
if (wordsArg) {
  const targetArg = process.argv.find((a) => a.startsWith('--target='));
  const target = targetArg ? targetArg.slice('--target='.length) : 'その他';
  const words = wordsArg
    .slice('--words='.length)
    .split(/[,、\s　]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  console.log(`任意ワード: ${words.join(' / ')} → 反映先: ${target}\n`);
  const t0 = Date.now();
  const wordMerged = new Map();
  for (const kw of words) {
    for (const tableKey of Object.keys(TABLES)) {
      const rows = await searchKeyword(tableKey, target, kw, includeBody);
      for (const r of rows) {
        const mkey = `${tableKey}:${r.id}`;
        const prev = wordMerged.get(mkey);
        if (prev) {
          if (!prev.keywords.includes(kw)) prev.keywords.push(kw);
        } else {
          wordMerged.set(mkey, {
            table: tableKey,
            title: r.title,
            current: r.current === 'general' ? '(未分類)' : r.current || '(未分類)',
            keywords: [kw],
          });
        }
      }
    }
  }
  const list = [...wordMerged.values()];
  console.log(`=== 「${words.join('」「')}」: ${list.length}件 ===`);
  for (const h of list.slice(0, 12)) {
    console.log(
      `  [${h.table}] ${String(h.title).slice(0, 60)} ｜ ${h.current} → ${target} ｜ 一致: ${h.keywords.join(',')}`,
    );
  }
  if (list.length > 12) console.log(`  ...ほか${list.length - 12}件`);
  console.log(`\n所要時間: ${Date.now() - t0}ms`);
  console.log('（ドライラン: 書き込みは一切行っていません）');
  process.exit(0);
}

const started = Date.now();
// key = `${table}:${id}`（APIのプレビューと同じマージ規則: 先勝ち=辞書の先頭カテゴリ優先）
const merged = new Map();
const addHit = (tableKey, r, category, kwLabel, tier) => {
  const mkey = `${tableKey}:${r.id}`;
  const prev = merged.get(mkey);
  if (prev) {
    if (!prev.keywords.includes(kwLabel)) prev.keywords.push(kwLabel);
    if (tier === 'B') prev.viaB = prev.viaB || !prev.viaA;
    else prev.viaA = true;
  } else {
    merged.set(mkey, {
      table: tableKey,
      title: r.title,
      current: r.current === 'general' ? '(未分類)' : r.current || '(未分類)',
      category,
      keywords: [kwLabel],
      viaA: tier === 'A',
      viaB: tier === 'B',
    });
  }
};

// 1) Tier A（単独ヒット）
for (const [category, set] of Object.entries(CATEGORY_KEYWORDS)) {
  for (const kw of set.primary) {
    for (const tableKey of Object.keys(TABLES)) {
      const rows = await sqlRetry(() => searchKeyword(tableKey, category, kw, includeBody));
      for (const r of rows) addHit(tableKey, { ...r, id: Number(r.id) }, category, kw, 'A');
    }
  }
}
const tierACounts = Object.fromEntries(
  Object.keys(CATEGORY_KEYWORDS).map((c) => [
    c,
    [...merged.values()].filter((h) => h.category === c).length,
  ]),
);

// 2) Tier B（候補→全文書共起チェック）
const tierBStats = {}; // kw → { candidates, adopted }
for (const [category, set] of Object.entries(CATEGORY_KEYWORDS)) {
  for (const kw of set.secondary) {
    tierBStats[kw] = { candidates: 0, adopted: 0 };
    for (const tableKey of Object.keys(TABLES)) {
      const rows = await sqlRetry(() => searchKeyword(tableKey, category, kw, includeBody));
      tierBStats[kw].candidates += rows.length;
      if (rows.length === 0) continue;
      const ids = [...new Set(rows.map((r) => Number(r.id)))];
      const coById = new Map();
      for (const pkw of set.primary) {
        const hitIds = await sqlRetry(() => cooccurIds(tableKey, pkw, ids));
        for (const id of hitIds) {
          const list = coById.get(id) ?? [];
          if (!list.includes(pkw)) list.push(pkw);
          coById.set(id, list);
        }
      }
      for (const r of rows) {
        const co = coById.get(Number(r.id));
        if (!co || co.length === 0) continue; // Tier B 単独では採用しない
        tierBStats[kw].adopted += 1;
        addHit(tableKey, { ...r, id: Number(r.id) }, category, `${kw}（＋${co.join('・')}）`, 'B');
      }
    }
  }
}
const elapsed = Date.now() - started;

async function sqlRetry(fn) {
  // Neon HTTP の一時エラー対策（読み取りのみなので単純リトライで安全）
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= 2) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

const hits = [...merged.values()];
for (const [category, set] of Object.entries(CATEGORY_KEYWORDS)) {
  const list = hits.filter((h) => h.category === category);
  const viaBOnly = list.filter((h) => h.viaB && !h.viaA);
  console.log(
    `\n=== ${category}: Tier Aのみ=${tierACounts[category]}件 → Tier B共起込み=${list.length}件（B経由の追加=${viaBOnly.length}件） ===`,
  );
  for (const h of list.slice(0, 12)) {
    console.log(
      `  [${h.table}] ${String(h.title).slice(0, 60)} ｜ ${h.current} → ${category} ｜ 一致: ${h.keywords.join(',')}`,
    );
  }
  if (list.length > 12) console.log(`  ...ほか${list.length - 12}件`);
  if (set.secondary.length > 0) {
    console.log(`  --- Tier B 内訳（候補=スコープ内一致 / 採用=Tier A共起あり） ---`);
    for (const kw of set.secondary) {
      const s = tierBStats[kw];
      console.log(`  ${kw}: 候補${s.candidates}件 → 採用${s.adopted}件（単独採用=0）`);
    }
  }
}
console.log(`\n所要時間（全キーワード×両テーブル検索の合計・直列実行）: ${elapsed}ms`);
console.log('（ドライラン: 書き込みは一切行っていません）');
