// docs/knowledge/note_x_playbook_kb_v2.md → src/lib/knowledge/noteXPlaybook.ts を機械生成する（265a）。
// 本文は一切編集・要約しない。ID章（## [ID]）と、IDを持たない Part A/W/S/R（# Part X —）を
// 同一の器（PlaybookEntry）に格納する。KB更新時は本スクリプトで作り直す（手編集しない）。
// 実行: node scripts/gen-playbook.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'docs/knowledge/note_x_playbook_kb_v2.md');
const OUT = join(ROOT, 'src/lib/knowledge/noteXPlaybook.ts');

const md = readFileSync(SRC, 'utf8');
const lines = md.split('\n');

const entries = [];
let cur = null;
const push = () => {
  if (cur) {
    while (cur.body.length && /^(\s*|---)$/.test(cur.body[cur.body.length - 1])) cur.body.pop();
    entries.push({ id: cur.id, title: cur.title, body: cur.body.join('\n') });
    cur = null;
  }
};

const PART_IDS = { A: 'PART-A', W: 'PART-W', S: 'PART-S', R: 'PART-R' };

for (const line of lines) {
  const idMatch = line.match(/^## \[([A-Z]+-\d+)\] (.+)$/);
  const partMatch = line.match(/^# Part ([AWSR]) — (.+)$/);
  const otherTop = line.match(/^# (?!Part [AWSR] — )/);
  if (idMatch) {
    push();
    cur = { id: idMatch[1], title: idMatch[2].trim(), body: [] };
    continue;
  }
  if (partMatch) {
    push();
    cur = { id: PART_IDS[partMatch[1]], title: `Part ${partMatch[1]} — ${partMatch[2].trim()}`, body: [] };
    continue;
  }
  if (otherTop) {
    push();
    continue;
  }
  if (cur) cur.body.push(line);
}
push();

const seen = new Set();
for (const e of entries) {
  if (seen.has(e.id)) throw new Error(`duplicate id: ${e.id}`);
  seen.add(e.id);
  if (!e.body.trim()) throw new Error(`empty body: ${e.id}`);
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const ts = `// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// note × X 運用・収益化ナレッジベース v2.0 の定数化（指示書265a）
// 正本: docs/knowledge/note_x_playbook_kb_v2.md（本文は無編集で転記＝機械生成）
// 再生成: KB更新時は node scripts/gen-playbook.mjs で作り直す（手編集しない）
// 設計: AI参照素材（context体系）には入れない（ユーザー編集で品質土台が崩れるため）。
//       全文をプロンプトへ投げず、機能ごとに必要IDだけ getPlaybook() で注入する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const PLAYBOOK_VERSION = '2.0';
export const PLAYBOOK_UPDATED = '2026-08-25';

export type PlaybookEntry = { id: string; title: string; body: string };

export const PLAYBOOK: PlaybookEntry[] = [
${entries.map((e) => `  {\n    id: '${e.id}',\n    title: ${JSON.stringify(e.title)},\n    body: \`${esc(e.body)}\`,\n  },`).join('\n')}
];

const BY_ID = new Map(PLAYBOOK.map((e) => [e.id, e]));

/** 指定IDの章のみを結合して返す。存在しないIDは throw（fail-closed＝黙って空文字を返さない） */
export function getPlaybook(ids: string[]): string {
  return ids
    .map((id) => {
      const e = BY_ID.get(id);
      if (!e) throw new Error(\`[noteXPlaybook] 未定義のナレッジID: \${id}\`);
      return \`## [\${e.id}] \${e.title}\\n\${e.body}\`;
    })
    .join('\\n\\n');
}
`;
writeFileSync(OUT, ts);
console.log(`generated: ${entries.length} entries`);
