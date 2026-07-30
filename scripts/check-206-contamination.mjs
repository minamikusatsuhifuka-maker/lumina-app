// 206: 過去のAI応答パース失敗で保存された「疑わしいレコード」の抽出（読み取り専用・修正禁止）。
// 205調査で判明した偽デフォルト値のシグネチャと機械的に一致するものを列挙する。
// 削除・修正は院長判断後に別指示書で行う。
//
// 使い方:
//   node --env-file=.env.local scripts/check-206-contamination.mjs

import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL がありません（--env-file で渡してください）');
  process.exit(1);
}
const sql = neon(url);

function printRows(label, rows, cols) {
  console.log(`\n=== ${label}: ${rows.length}件 ===`);
  if (rows.length === 0) {
    console.log('  0件（過去にこの失敗パターンで保存されたレコードなし）');
    return;
  }
  for (const r of rows.slice(0, 30)) {
    console.log('  ' + cols.map((c) => `${c}=${String(r[c] ?? '').slice(0, 40)}`).join(' ｜ '));
  }
  if (rows.length > 30) console.log(`  ...ほか${rows.length - 30}件`);
}

async function safe(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.log(`\n=== ${label}: 取得失敗 ===`);
    console.log('  ' + (e?.message ?? e));
    return null;
  }
}

// #2 1on1: 偽デフォルト（パース失敗ダミー or 空result+デフォルト値）と完全一致
const oneOnOne = await safe('1on1（one_on_one_meetings）偽デフォルト', () => sql`
  SELECT id, staff_name, meeting_date, created_at, ai_analysis, mindset_score, motivation_level
  FROM one_on_one_meetings
  WHERE ai_analysis = '分析データを取得できませんでした。'
     OR (COALESCE(ai_analysis,'') = '' AND mindset_score = 70 AND motivation_level = 70
         AND growth_stage = 'Lv3行う')
  ORDER BY created_at DESC
`);
if (oneOnOne) printRows('1on1 偽デフォルト疑い', oneOnOne, ['id', 'staff_name', 'meeting_date', 'created_at']);

// #3 職員評価: 旧実装のUPDATEは ai_evaluation 列のみ（promotion_eligible は列に保存されない実装だった）。
// 失敗シグネチャ=ai_evaluation が空（jsonMatchなし時は応答先頭300字が入るため完全特定は不可→空のみ機械判定）
const staffEval = await safe('職員評価（staff_evaluations）ai_evaluation空', () => sql`
  SELECT id, staff_name, created_at, updated_at
  FROM staff_evaluations
  WHERE COALESCE(ai_evaluation, '') = ''
  ORDER BY created_at DESC
`);
if (staffEval) printRows('職員評価 ai_evaluation空', staffEval, ['id', 'staff_name', 'created_at']);

// #4 応募者: 解析エラーダミー（名前・コメント・全0点のシグネチャ）
const applicants = await safe('応募者（applicants）解析エラーダミー', () => sql`
  SELECT id, name, position, total_score, created_at
  FROM applicants
  WHERE name = '解析エラー'
     OR ai_comment = '解析に失敗しました。再度お試しください。'
     OR total_score = 0
  ORDER BY created_at DESC
`);
if (applicants) printRows('応募者 解析エラー/全0点疑い', applicants, ['id', 'name', 'position', 'total_score', 'created_at']);

// #6 memory: 要約 or キーワード欠落（旧実装はタイトルをそのままsummaryに入れkeywords空で保存）
const memory = await safe('memory（memory_items）要約/キーワード欠落', () => sql`
  SELECT id, summary, source_title, keywords, created_at
  FROM memory_items
  WHERE COALESCE(keywords, '') = ''
     OR COALESCE(summary, '') = ''
     OR summary = COALESCE(source_title, '')
  ORDER BY created_at DESC
`);
if (memory) printRows('memory 欠落疑い', memory, ['id', 'summary', 'created_at']);

// #1 near-miss: 全件数のみ把握（再チェックはAIコストがかかるため件数と手順提案まで）
const nearMiss = await safe('near-miss（near_miss_reports）件数', () => sql`
  SELECT COUNT(*)::int AS n, MIN(created_at) AS oldest, MAX(created_at) AS newest
  FROM near_miss_reports
`);
if (nearMiss) {
  console.log(`\n=== near-miss 通過済み報告 ===`);
  console.log(`  総件数: ${nearMiss[0].n}件（${nearMiss[0].oldest ?? '-'} 〜 ${nearMiss[0].newest ?? '-'}）`);
  console.log('  ※旧実装はチェック失敗時に「個人情報なし」で通過していたため、全件が再チェック候補。');
  console.log('  再チェック手順の提案: check-privacy を件数分バッチ実行（1件≒数百トークン）し、');
  console.log('  has_personal_info:true のみ院長へ一覧提示 → 匿名化編集。別指示書で実施。');
}

console.log('\n（読み取り専用: 書き込みは一切行っていません）');
