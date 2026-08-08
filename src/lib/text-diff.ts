// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 左右diff比較のための差分計算（指示書236C）— AI呼び出しなし・依存ライブラリなし
//
// 既存の ProofreadDiffPane は「候補の before/after が既知」という前提の位置ベース
// ハイライトで、全文が書き換わるテイスト変換には使えない。ここでは汎用の差分を取る。
//
// 方式（日本語で読みやすい粒度にするための2段構え）:
//   1) 段落（行）単位で LCS を取り、equal / removed / added に分ける
//   2) 隣り合う removed+added が「似ている」なら、その中を文字単位でさらに差分化する
//      → 1文字直しただけの段落が「全消し＋全追加」に見えるのを防ぐ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DiffOp = 'equal' | 'removed' | 'added';

/** 段落内の文字単位の断片（色分けの最小単位） */
export interface InlinePart {
  op: DiffOp;
  text: string;
}

/** 左右2カラムに並べる1行分 */
export interface DiffRow {
  op: DiffOp | 'changed';
  /** 左（原文）。added のときは null */
  left: string | null;
  /** 右（変換後）。removed のときは null */
  right: string | null;
  /** op==='changed' のときのみ、行内の文字単位差分 */
  leftParts?: InlinePart[];
  rightParts?: InlinePart[];
}

export interface DiffStats {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

/* ══════════════ LCS（共通部分列） ══════════════ */

// 長さ制限つきの LCS テーブル。章本文（数千字・数十段落）を想定した素直な DP。
// 巨大入力での O(n*m) 爆発を避けるため、要素数の上限を設けて超過時は行単位の粗い差分に落とす。
const MAX_CELLS = 4_000_000;

function lcsMatrix<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

/** 汎用の差分列（equal/removed/added の並び）を返す */
function diffSequence<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): { op: DiffOp; value: T }[] {
  if (a.length * b.length > MAX_CELLS) {
    // 保険: 大きすぎる入力は「全削除→全追加」に落とす（固まるより粗い方がまし）
    return [...a.map((value) => ({ op: 'removed' as const, value })), ...b.map((value) => ({ op: 'added' as const, value }))];
  }
  const dp = lcsMatrix(a, b, eq);
  const out: { op: DiffOp; value: T }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (eq(a[i], b[j])) {
      out.push({ op: 'equal', value: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: 'removed', value: a[i] });
      i++;
    } else {
      out.push({ op: 'added', value: b[j] });
      j++;
    }
  }
  while (i < a.length) out.push({ op: 'removed', value: a[i++] });
  while (j < b.length) out.push({ op: 'added', value: b[j++] });
  return out;
}

/* ══════════════ 行内（文字単位）の差分 ══════════════ */

/** 連続する同じopをまとめて断片列にする */
function toParts(seq: { op: DiffOp; value: string }[], keep: DiffOp): InlinePart[] {
  const parts: InlinePart[] = [];
  for (const s of seq) {
    // 左カラムには added を出さない／右カラムには removed を出さない
    if (s.op !== 'equal' && s.op !== keep) continue;
    const last = parts[parts.length - 1];
    if (last && last.op === s.op) last.text += s.value;
    else parts.push({ op: s.op, text: s.value });
  }
  return parts;
}

export function inlineDiff(left: string, right: string): { leftParts: InlinePart[]; rightParts: InlinePart[] } {
  const seq = diffSequence([...left], [...right], (x, y) => x === y);
  return { leftParts: toParts(seq, 'removed'), rightParts: toParts(seq, 'added') };
}

/* ══════════════ 類似度（removed+added を「変更」に束ねる判定） ══════════════ */

/** 文字の共通数ベースの粗い類似度（0〜1）。行のペアリング用途にのみ使う */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const counts = new Map<string, number>();
  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let common = 0;
  for (const ch of b) {
    const c = counts.get(ch) ?? 0;
    if (c > 0) {
      common++;
      counts.set(ch, c - 1);
    }
  }
  return (2 * common) / (a.length + b.length);
}

const PAIR_THRESHOLD = 0.4; // これ以上似ていれば「同じ段落が書き換わった」とみなす

/* ══════════════ 本体 ══════════════ */

/**
 * 原文と変換後を左右2カラムに並べるための行データを作る。
 * **AI呼び出しなし・純関数**（サーバ/クライアント両用）。
 */
export function buildDiffRows(original: string, revised: string): { rows: DiffRow[]; stats: DiffStats } {
  const a = original.split('\n');
  const b = revised.split('\n');
  const seq = diffSequence(a, b, (x, y) => x === y);

  const rows: DiffRow[] = [];
  const stats: DiffStats = { added: 0, removed: 0, changed: 0, unchanged: 0 };

  for (let k = 0; k < seq.length; k++) {
    const cur = seq[k];
    if (cur.op === 'equal') {
      rows.push({ op: 'equal', left: cur.value, right: cur.value });
      stats.unchanged++;
      continue;
    }
    // removed の直後に added が続き、内容が似ていれば「変更行」として1行に束ねる
    if (cur.op === 'removed') {
      const next = seq[k + 1];
      if (next?.op === 'added' && similarity(cur.value, next.value) >= PAIR_THRESHOLD) {
        const { leftParts, rightParts } = inlineDiff(cur.value, next.value);
        rows.push({ op: 'changed', left: cur.value, right: next.value, leftParts, rightParts });
        stats.changed++;
        k++; // added を消費
        continue;
      }
      rows.push({ op: 'removed', left: cur.value, right: null });
      stats.removed++;
      continue;
    }
    rows.push({ op: 'added', left: null, right: cur.value });
    stats.added++;
  }

  return { rows, stats };
}

/** 見出し用の短い要約（「〜行を変更、〜行を追加」） */
export function describeDiffStats(stats: DiffStats): string {
  const parts: string[] = [];
  if (stats.changed > 0) parts.push(`${stats.changed}行を変更`);
  if (stats.added > 0) parts.push(`${stats.added}行を追加`);
  if (stats.removed > 0) parts.push(`${stats.removed}行を削除`);
  return parts.length > 0 ? parts.join('・') : '変更はありません';
}
