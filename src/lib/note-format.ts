// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 309: note記事の体裁「1文ごとに改行（句点で改行）・段落間は空行」の決定的な整形（DB 非依存・R-108・R-74）
//
// - 句点「。」「！」「？」（全角・半角の ! ?）の直後で改行する。ただし次が閉じ括弧・句読点・引用符なら分割しない
// - 括弧内（「」『』（）()【】［］[]）は分割しない（会話・補足が途中で切れない）
// - 見出し（#）・箇条書き（- * + 1.）・引用（>）・表（|）・区切り線（---）・コードフェンス内・URL を含む行は触らない
// - 段落間の空行はそのまま。行頭の空白は落とす。既に1文1行なら不変（冪等・U で固定）
// - 表示用レンダラ（renderMarkdown）は流用しない（R-71）。保存前とリッチコピー前の両方で**この同じ関数**を通す
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 文末とみなす記号（直後で改行） */
const SENTENCE_END = new Set(['。', '！', '？', '!', '?']);
/** 文末の直後にあっても分割しない（閉じ括弧・引用符・句読点・省略記号） */
const NO_BREAK_AFTER = new Set(['」', '』', '）', ')', '】', '］', ']', '"', "'", '”', '’', '、', '。', '！', '？', '!', '?', '…', '‥']);
/** 強調記号（** __ ~~ * _）。文末の直後にあるとき、その文の中で開いていれば閉じ記号として同じ文に含め、開いていなければ次の文の開始記号 */
const EMPHASIS_CHARS = new Set(['*', '_', '~']);

function countOccurrences(text: string, marker: string): number {
  let n = 0;
  let at = text.indexOf(marker);
  while (at >= 0) {
    n += 1;
    at = text.indexOf(marker, at + marker.length);
  }
  return n;
}
const OPEN_BRACKETS: Record<string, string> = { '「': '」', '『': '』', '（': '）', '(': ')', '【': '】', '［': '］', '[': ']' };
const CLOSE_BRACKETS = new Set(Object.values(OPEN_BRACKETS));

const HEADING_RE = /^#{1,6}\s/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s/;
const QUOTE_RE = /^\s*>/;
const TABLE_RE = /^\s*\|/;
const HR_RE = /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/;
const FENCE_RE = /^\s*(```|~~~)/;
const URL_RE = /https?:\/\/\S+/;

/** この行は「本文の段落」か（整形の対象）。見出し・箇条書き・引用・表・区切り線・URL 行は対象外 */
import { convertLatexMacros, sanitizeLatex } from './markdown-renderer';

export function isProseLine(line: string): boolean {
  if (!line.trim()) return false;
  if (HEADING_RE.test(line) || LIST_RE.test(line) || QUOTE_RE.test(line) || TABLE_RE.test(line) || HR_RE.test(line)) return false;
  if (URL_RE.test(line)) return false;
  return true;
}

/** 1行を「1文1行」に分割する（括弧内は分割しない・空文は捨てる） */
export function splitSentences(line: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  let cur = '';
  const chars = Array.from(line);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    cur += ch;
    if (OPEN_BRACKETS[ch]) {
      stack.push(OPEN_BRACKETS[ch]);
      continue;
    }
    if (CLOSE_BRACKETS.has(ch)) {
      if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop();
      continue;
    }
    if (!SENTENCE_END.has(ch) || stack.length > 0) continue;
    // 直後が閉じ括弧・句読点なら、その記号まで同じ文に含めてから切る。強調記号は「この文で開いているもの」だけ閉じとして含める
    let j = i + 1;
    while (j < chars.length) {
      const c = chars[j];
      if (NO_BREAK_AFTER.has(c)) {
        cur += c;
        j += 1;
        continue;
      }
      if (EMPHASIS_CHARS.has(c)) {
        let run = 0;
        while (j + run < chars.length && chars[j + run] === c) run += 1;
        const marker = c.repeat(run);
        if (countOccurrences(cur, marker) % 2 === 1) {
          cur += marker;
          j += run;
          continue;
        }
      }
      break;
    }
    i = j - 1;
    // 行末なら切らない（末尾の空白だけ落とす）
    const rest = chars.slice(j).join('');
    if (!rest.trim()) break;
    out.push(cur.trim());
    cur = '';
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * 本文全体を「1文ごとに改行・段落間は空行」に整える。同じ入力→同じ出力、整形済みを通しても不変（冪等）
 */
// ───────────────────────────────────────────────────────────────────────────
// 324追加: LaTeX 記法の露出を止める（$\rightarrow$ 等）。生成後の決定的な整形（DB非依存・冪等）
// - $...$（直後が数字・空白の「金額」は除外）と \( \) \[ \] の中身を、markdown-renderer の変換表
//   （\rightarrow→→／\leftarrow→←／\to→→／\times→×／\pm→±／\approx→≈／\le \leq→≤／\ge \geq→≥／ギリシャ文字／\%→%／\_→_ …）で置換し、
//   表に無いものは $ と \ を外して中身だけ残す（convertLatexMacros と同じ規則）
// - コードブロック（```）とインラインコード（``）の中は触らない
// - 適用の順は stripInlineLatex → formatOneSentencePerLine → enforceNoteHeadingLevels（note 経路は後ろ2つ）。
//   formatOneSentencePerLine は先頭で stripInlineLatex を呼ぶ＝310 の6経路には自動で効く（U80 の一覧は不変）
// ───────────────────────────────────────────────────────────────────────────
export function stripInlineLatex(markdown: string): string {
  const raw = markdown ?? '';
  if (!raw || (raw.indexOf('\\') === -1 && raw.indexOf('$') === -1)) return raw;
  const stash: string[] = [];
  let text = raw.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => {
    stash.push(m);
    // 番兵は sanitizeLatex の内部番兵（NUL＋数字）と衝突しない形にする
    return `\u0001L${stash.length - 1}L\u0001`;
  });
  // 既存の変換（既知マクロ・上付き下付き・書体マクロ）
  text = sanitizeLatex(text);
  // 残った $...$（金額を除く）は中身だけ残す（$x=5$ → x=5）。\( \) \[ \] は sanitizeLatex が外している
  text = text.replace(/\$(?![\s\d])([^$\n]*?)\$/g, (_f, inner: string) => convertLatexMacros(inner));
  // \% \_ \& \# のエスケープ
  text = text.replace(/\\([%_&#])/g, '$1');
  text = text.replace(/\u0001L(\d+)L\u0001/g, (_m, i: string) => stash[Number(i)] ?? '');
  return text;
}

export function formatOneSentencePerLine(markdownInput: string): string {
  // 324追加: 先に LaTeX 記法を外す（冪等）
  const markdown = stripInlineLatex(markdownInput);
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;
  for (const raw of lines) {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      out.push(raw);
      continue;
    }
    if (inFence || !isProseLine(raw)) {
      out.push(raw);
      continue;
    }
    const parts = splitSentences(raw);
    if (parts.length === 0) out.push(raw.trim());
    else out.push(...parts);
  }
  return out.join('\n');
}

export interface SentenceLineViolation {
  line: number;
  text: string;
}

/** 検査（@gen・画面の警告用）: 本文の段落で「文末の後に続きがある行」を列挙する。0件＝1文1行 */
export function findMultiSentenceLines(markdown: string): SentenceLineViolation[] {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: SentenceLineViolation[] = [];
  let inFence = false;
  lines.forEach((raw, idx) => {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence || !isProseLine(raw)) return;
    if (splitSentences(raw).length > 1) out.push({ line: idx + 1, text: raw.slice(0, 80) });
  });
  return out;
}

export function isOneSentencePerLine(markdown: string): boolean {
  return findMultiSentenceLines(markdown).length === 0;
}

/** プロンプトに課す文言（①ペルソナ経路の構造規約に並べる。表示側の整形と同じ規則） */
export const ONE_SENTENCE_PER_LINE_RULE = `- 1文ごとに改行する（句点「。」「！」「？」の直後で改行。1行に2文以上を置かない）
- 段落の間は空行1行で区切る（括弧内・見出し・箇条書き・引用は分割しない）`;

// ───────────────────────────────────────────────────────────────────────────
// 310追加: 見出し規約（note は ## と ### の2階層・# は使わない・タイトルは本文に含めない）の決定的な整形（冪等）
// ───────────────────────────────────────────────────────────────────────────

/** プロンプトに課す文言（共通規約 NOTE_COMMON_RULES に1回だけ並べる） */
export const NOTE_HEADING_RULE = `- 見出しは大見出し（##）と小見出し（###）の2階層だけを使う。#（h1）は使わない（記事タイトルは本文に含めず、note のタイトル欄に貼る）`;

/**
 * 行頭「# 」（h1）は「## 」へ降格、「####」以下は「###」へ丸める。コードフェンス内は触らない。同じ入力→同じ出力・冪等
 */
export function enforceNoteHeadingLevels(markdown: string): string {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  let inFence = false;
  return lines
    .map((raw) => {
      if (FENCE_RE.test(raw)) {
        inFence = !inFence;
        return raw;
      }
      if (inFence) return raw;
      const m = /^(#{1,6})(\s+)(.*)$/.exec(raw);
      if (!m) return raw;
      const level = m[1].length;
      if (level === 1) return `## ${m[3]}`;
      if (level >= 4) return `### ${m[3]}`;
      return raw;
    })
    .join('\n');
}

/** 検査: h1 または #### 以下の見出し行（コードフェンス外）を列挙。0件＝規約どおり */
export function findBadHeadingLines(markdown: string): SentenceLineViolation[] {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: SentenceLineViolation[] = [];
  let inFence = false;
  lines.forEach((raw, idx) => {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (/^#\s/.test(raw) || /^#{4,}\s/.test(raw)) out.push({ line: idx + 1, text: raw.slice(0, 80) });
  });
  return out;
}
