#!/usr/bin/env node
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 失敗トレースの追記（指示書233③）
//
//   npm run trace -- <便> <事象> <原因> <ルール> <検証方法>
//   npm run trace -- 234 --none            # 成功だけの便＝「特記なし」1行
//   npm run trace -- --show                # 今日のトレースを表示
//
// 出力先: ~/Downloads/lumina_traces/YYYYMMDD.md（リポジトリ外・gitに入れない）
//
// 手書きだと形式が便ごとに崩れて後から集計できなくなるため、追記はこのスクリプトに寄せる。
// ファイルが無ければ表（ヘッダ＋注意書き）ごと作る。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { existsSync, readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = join(homedir(), 'Downloads', 'lumina_traces');
const now = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const ymd = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}`;
const hhmm = `${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
const FILE = join(DIR, `${ymd}.md`);

const HEADER = `# xLUMINA 失敗トレース ${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}

指示書233③の運用ファイル。**リポジトリ外**。便ごとの失敗・手戻り・想定外を1行1件で記録する。

- 「抽象化したルール」列は \`R-NN\`（RULES.md に登録済み）または \`未登録\`（＋理由）
- 成功だけの便は「特記なし」1行で可
- **個人情報・生成本文は書かない**（識別子と事象のみ）
- 蓄積が溜まったら、次の handover 作成時に「学習の要約」として反映する

| 日時 | 便 | 事象 | 原因 | 抽象化したルール | 再発防止の検証方法 |
|---|---|---|---|---|---|
`;

/** 表のセルを壊さない形に均す（改行・パイプはセル内に置けない） */
function cell(s) {
  return String(s ?? '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '｜')
    .trim()
    .slice(0, 300);
}

const args = process.argv.slice(2);

if (args.includes('--show')) {
  if (!existsSync(FILE)) {
    console.log(`（${FILE} はまだありません）`);
    process.exit(0);
  }
  console.log(readFileSync(FILE, 'utf8'));
  process.exit(0);
}

if (args.length === 0) {
  console.error(`使い方:
  npm run trace -- <便> <事象> <原因> <ルール> <検証方法>
  npm run trace -- <便> --none     # 特記なし
  npm run trace -- --show          # 今日のトレースを表示

出力先: ${FILE}
注意: 個人情報・生成本文は書かない（識別子と事象のみ）`);
  process.exit(1);
}

mkdirSync(DIR, { recursive: true });
if (!existsSync(FILE)) writeFileSync(FILE, HEADER, 'utf8');

const [flight, ...rest] = args;
const row =
  rest[0] === '--none'
    ? `| ${hhmm} | ${cell(flight)} | 特記なし | — | — | — |\n`
    : `| ${hhmm} | ${cell(flight)} | ${cell(rest[0])} | ${cell(rest[1])} | ${cell(rest[2])} | ${cell(rest[3])} |\n`;

// 「学習の要約」セクションが既にある場合は、その手前（表の末尾）に挿入する
const body = readFileSync(FILE, 'utf8');
const marker = '\n## 学習の要約';
const at = body.indexOf(marker);
if (at >= 0) {
  writeFileSync(FILE, body.slice(0, at) + row + body.slice(at), 'utf8');
} else {
  appendFileSync(FILE, row, 'utf8');
}

console.log(`✅ 追記しました: ${FILE}`);
console.log(row.trim());
if (rest[0] !== '--none' && !/^R-\d+$/.test(String(rest[2] ?? '').trim())) {
  console.log('\n💡 「抽象化したルール」がR-NN形式ではありません。RULES.md への登録が必要か確認してください。');
}
