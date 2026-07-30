// 207: near-miss 通過済みレコードの個人情報バッチ再チェック【判定のみ・書き換え禁止】。
// 旧fail-open実装（206以前）で素通しされた可能性のある全レコードに対し、
// 206で是正済みの check-privacy と同一ロジック（lib/privacy-check.ts）を適用する。
// - DBへの書き込みは一切しない（読み取り専用）
// - 失敗した件は fail-closed＝「判定不能・要手動確認」として記録（「なし」に丸めない）
// - 結果は個人情報を含む可能性があるため**リポジトリ外**（~/Downloads）へ出力し、
//   gitにコミットしない・チャット報告には集計とIDのみ載せる
//
// 使い方:
//   node --env-file=.env.local scripts/recheck-207-nearmiss.mjs

import { neon } from '@neondatabase/serverless';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { checkPrivacyText } from '../src/lib/privacy-check.ts';

const url = process.env.DATABASE_URL;
if (!url || !process.env.ANTHROPIC_API_KEY) {
  console.error('DATABASE_URL / ANTHROPIC_API_KEY がありません（--env-file で渡してください）');
  process.exit(1);
}
const sql = neon(url);

// UI（staff/near-miss の checkPrivacy）と同じテキスト構成でチェックする
const rows = await sql`
  SELECT id, created_at, report_type, incident, direct_cause, background_cause,
         prevention_personal, prevention_team, reflection, comment
  FROM near_miss_reports
  ORDER BY id ASC
`;
console.log(`対象: ${rows.length}件`);

const results = [];
for (const r of rows) {
  const text = [
    r.incident,
    r.direct_cause,
    r.background_cause,
    r.prevention_personal,
    r.prevention_team,
    r.reflection,
    r.comment,
  ]
    .filter(Boolean)
    .join('\n');

  if (!text.trim()) {
    results.push({ id: r.id, created_at: r.created_at, verdict: 'なし', detail: '（本文が空）' });
    console.log(`id=${r.id}: 本文空 → なし`);
    continue;
  }

  const res = await checkPrivacyText(text);
  let verdict;
  if (res.check_failed) verdict = '判定不能・要手動確認';
  else verdict = res.has_personal_info ? 'あり' : 'なし';
  results.push({
    id: r.id,
    created_at: r.created_at,
    verdict,
    detail: res.has_personal_info && !res.check_failed
      ? `検出: ${res.detected_items.join(' / ') || '(種別記載なし)'}\n    提案: ${res.suggestion || '-'}`
      : res.check_failed
        ? '（AI呼び出し/パース失敗のためfail-closed）'
        : '',
  });
  console.log(`id=${r.id}: ${verdict}`);
}

const counts = {
  あり: results.filter((x) => x.verdict === 'あり').length,
  なし: results.filter((x) => x.verdict === 'なし').length,
  判定不能: results.filter((x) => x.verdict === '判定不能・要手動確認').length,
};

const lines = [
  '# 207 near-miss 個人情報バッチ再チェック結果',
  '',
  `- 実行対象: near_miss_reports 全${rows.length}件（旧fail-open実装で通過済み）`,
  `- 判定ロジック: 206是正後の check-privacy と同一（lib/privacy-check.ts・fail-closed）`,
  `- 集計: **あり ${counts.あり}件 ／ なし ${counts.なし}件 ／ 判定不能・要手動確認 ${counts.判定不能}件**`,
  '- 本ファイルは個人情報を含む可能性があるため git にコミットしない',
  '',
  '| ID | 作成日時 | 判定 |',
  '|---|---|---|',
  ...results.map((x) => `| ${x.id} | ${new Date(x.created_at).toLocaleString('ja-JP')} | ${x.verdict} |`),
  '',
  '## 「あり」「判定不能」の詳細（院長が匿名化の要否を判断する用）',
  '',
  ...results
    .filter((x) => x.verdict !== 'なし')
    .flatMap((x) => [`### ID ${x.id}（${x.verdict}）`, x.detail || '-', '']),
];

const outPath = join(homedir(), 'Downloads', '207_再チェック結果_nearmiss.md');
writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`\n集計: あり${counts.あり} / なし${counts.なし} / 判定不能${counts.判定不能}`);
console.log(`報告書を出力しました: ${outPath}`);
console.log('（読み取り専用: DBへの書き込みは一切行っていません）');
