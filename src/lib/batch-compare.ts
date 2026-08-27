// 271: バッチリサーチ結果の横並び比較（PC最大3列・本文/要約の切替・同期スクロール）の純ロジック。
//
// ここに置く理由: 画面（deepresearch/page.tsx）とカード部品（BatchCompareView）の両方が
// 同じ判断（何列出すか・何件まで選べるか・どちらの本文を出すか）を必要とする。
// 判断を1箇所に集めて、単体テスト（U43）で機械判定できるようにする。

/** 比較対象として保存済みのバッチ結果1件（context_saves の1行） */
export type BatchResult = {
  id: number;
  topic: string;
  context_text: string;
  research_text: string;
  created_at: string;
};

/**
 * 271§1-2: 最大3列。1920px幅で1列あたり約600px＝日本語35〜40字/行となり、
 * 3,000〜5,000字の本文でも読める幅になる。4列（約450px）は長文比較に窮屈なので実装しない。
 */
export const BATCH_COMPARE_MAX = 3;

/** 表示モード。初回の既定は本文（271§2-1） */
export type BatchCompareMode = 'research' | 'summary';
export const BATCH_COMPARE_MODE_DEFAULT: BatchCompareMode = 'research';
export const BATCH_COMPARE_MODE_KEY = 'lumina_batch_compare_mode';

/** 最後に選んだモードを次回も使う（271§2-1）。読めない環境では既定＝本文 */
export function loadCompareMode(): BatchCompareMode {
  try {
    if (typeof window === 'undefined') return BATCH_COMPARE_MODE_DEFAULT;
    const v = window.localStorage.getItem(BATCH_COMPARE_MODE_KEY);
    return v === 'summary' || v === 'research' ? v : BATCH_COMPARE_MODE_DEFAULT;
  } catch {
    return BATCH_COMPARE_MODE_DEFAULT;
  }
}

export function saveCompareMode(mode: BatchCompareMode): void {
  try {
    window.localStorage.setItem(BATCH_COMPARE_MODE_KEY, mode);
  } catch {}
}

/**
 * 271§4-1: 選択のトグル。上限（3件）を超える追加は**受け付けない**（押しても何も起きない）。
 * 上限を超えた分を古い方から押し出す実装にしない——比較中の列が黙って消えるのは事故に見える。
 */
export function toggleCompareId(ids: number[], id: number, max = BATCH_COMPARE_MAX): number[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (ids.length >= max) return ids;
  return [...ids, id];
}

/**
 * 271§4-2: 実際に出す列数。横スクロールを出さないため、
 * 「選んだ件数」と「端末（カーソルの有無）」の小さい方に倒す。
 * 幅による 3→2 の切り替えはCSS側（Tailwindのブレークポイント）が受け持つ。
 */
export function resolveCompareColumns(selectedCount: number, finePointer: boolean): 1 | 2 | 3 {
  if (!finePointer) return 1; // タッチ端末は常に1列（271§4-2・モバイル多列は範囲外）
  const n = Math.min(Math.max(selectedCount, 1), BATCH_COMPARE_MAX);
  return n as 1 | 2 | 3;
}

/**
 * 列数に対応するTailwindクラス（R-17: 完全リテラル。動的組み立てをしない）。
 * 3列は xl（1280px〜）で3列、md（768px〜）で2列、それ未満は1列＝横スクロールが出ない。
 */
export function compareGridClass(cols: 1 | 2 | 3): string {
  if (cols === 1) return 'grid gap-3 grid-cols-1';
  if (cols === 2) return 'grid gap-3 grid-cols-1 md:grid-cols-2';
  return 'grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
}

/**
 * 271§3-1: 同期スクロールは**割合ベース**。
 * ピクセルで合わせると長さの違う列（3,000字と5,000字）で片方が先に底に着いて破綻する。
 * スクロールできない列（本文が短くて収まっている）は 0 を返す。
 */
export function scrollRatioOf(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  const r = scrollTop / max;
  return Math.min(1, Math.max(0, r));
}

/** 割合から、その列で対応するスクロール位置を求める */
export function syncScrollTop(ratio: number, scrollHeight: number, clientHeight: number): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * max);
}

// 263③: バッチ結果は「## 📋 要約（1000字以内）」＋「## 📚 詳細コンテキスト」の形で保存済み。
// 271はこの**保存済みの要約**を使う（AIで再生成しない）。
// 既存データ（要約セクションなし）は summarySection: null、detailContext に全文を返す。
export function parseContextWithSummary(contextText: string): {
  summarySection: string | null;
  detailContext: string;
} {
  if (!contextText) return { summarySection: null, detailContext: '' };
  const summaryHeader = '## 📋 要約';
  const detailHeader = '## 📚 詳細コンテキスト';
  if (!contextText.startsWith(summaryHeader)) {
    return { summarySection: null, detailContext: contextText };
  }
  const detailIdx = contextText.indexOf(detailHeader);
  if (detailIdx === -1) {
    // 要約ヘッダはあるが詳細ヘッダがない → 全文を要約として扱わず安全側に倒す
    return { summarySection: null, detailContext: contextText };
  }
  // 要約セクション = 要約ヘッダ直後〜詳細ヘッダ手前（区切り --- を除去）
  const rawSummary = contextText.slice(summaryHeader.length, detailIdx);
  const summarySection = rawSummary
    .replace(/^[^\n]*\n+/, '')
    .replace(/\n+---\n*$/, '')
    .trim();
  const detailContext = contextText
    .slice(detailIdx + detailHeader.length)
    .replace(/^\n+/, '')
    .trim();
  return {
    summarySection: summarySection || null,
    detailContext: detailContext || contextText,
  };
}

/**
 * 271§2-1: その列に出す本文を決める。
 * 要約モードでも、保存済みの要約が無い古いデータは**本文にフォールバックし、その旨を伝える**
 * （空欄にすると「比較できない理由」が画面から消える。fail-closed＝黙って空にしない）。
 */
export function pickCompareText(
  result: Pick<BatchResult, 'research_text' | 'context_text'>,
  mode: BatchCompareMode,
): { text: string; fellBack: boolean } {
  const research = result.research_text || '';
  if (mode === 'research') return { text: research, fellBack: false };
  const { summarySection } = parseContextWithSummary(result.context_text || '');
  if (summarySection) return { text: summarySection, fellBack: false };
  return { text: research, fellBack: true };
}
