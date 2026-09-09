// 287: 📚リサーチ保存の「🔗 AIでまとめる」（AI統合サマリー）の保存まわりの純ロジック。
//
// - タイトルは**決定的に導出**する（R-74・277 §2-2 と同じ方針。AIで命名しない・時刻を使わない）:
//   選んだ資料の1件目のタイトル＋「他n件」。同じ選択なら同じ名前になる。
// - 本文が空なら保存しない（fail-closed）。判定はここに置き、画面とAPIの両方で同じ関数を使う。

import { truncateTitle } from '@/lib/batch-title';

export const MERGE_REPORT_TYPE = 'merge';
export const MERGE_REPORT_GROUP = '統合レポート';
export const MERGE_REPORT_TAGS = '統合レポート';
export const MERGE_TITLE_PREFIX = '統合サマリー';
export const MERGE_TITLE_HEAD_MAX = 40;

/** 「統合サマリー: <1件目> 他n件」。資料名が無ければ接頭辞だけ */
export function deriveMergeTitle(sourceTitles: readonly unknown[]): string {
  const names = sourceTitles
    .map((t) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : ''))
    .filter((t) => t.length > 0);
  if (names.length === 0) return MERGE_TITLE_PREFIX;
  const head = truncateTitle(names[0], MERGE_TITLE_HEAD_MAX);
  return names.length === 1 ? `${MERGE_TITLE_PREFIX}: ${head}` : `${MERGE_TITLE_PREFIX}: ${head} 他${names.length - 1}件`;
}

/** 保存できる本文か（空・空白のみは不可） */
export function hasSavableContent(content: unknown): content is string {
  return typeof content === 'string' && content.trim().length > 0;
}

// ───────────────────────────────────────────────────────────────────────────
// 317 §3-1: 二段出力（要約 1,000〜2,000字／詳細 5,000〜8,000字）。長さは目標として指示し、範囲外でも捨てない（R-101）
// ───────────────────────────────────────────────────────────────────────────

export type MergeMode = 'summary' | 'detail';
export const MERGE_MODES: readonly MergeMode[] = ['summary', 'detail'];
export function isMergeMode(v: unknown): v is MergeMode {
  return v === 'summary' || v === 'detail';
}
export type MergeSelection = 'both' | MergeMode;
export const MERGE_SELECTIONS: readonly MergeSelection[] = ['both', 'summary', 'detail'];
export const MERGE_SELECTION_LABEL: Record<MergeSelection, string> = { both: '要約＋詳細', summary: '要約のみ', detail: '詳細のみ' };
export function modesOf(selection: MergeSelection): MergeMode[] {
  return selection === 'both' ? ['summary', 'detail'] : [selection];
}
export const MERGE_MODE_LABEL: Record<MergeMode, string> = { summary: '要約', detail: '詳細' };
/** 目標の文字数（下限〜上限） */
export const MERGE_TARGET: Record<MergeMode, { min: number; max: number }> = { summary: { min: 1000, max: 2000 }, detail: { min: 5000, max: 8000 } };
/** maxTokens は上限の文字数（≈1.5 tok/字で余裕）から。下限 2048 ガード（R-03） */
export const MERGE_MAX_TOKENS: Record<MergeMode, number> = { summary: Math.max(2048, 4000), detail: Math.max(2048, 12000) };
/** R-73/R-118: ルートの maxDuration（リテラル・U89 で一致固定）と、リトライ込みの内部タイムアウト。時間切れは明示の終端（timedOut）で返す */
export const MERGE_MAX_DURATION_S = 300;
export const MERGE_TIMEOUT_MS = 260_000;
export const MERGE_RETRIES = 2;
export const MERGE_TIMEOUT_MESSAGE = `時間切れです（${MERGE_TIMEOUT_MS / 1000}秒）。この本は保存されていません。「再実行」でこの本だけやり直せます。`;

/** 長さの指示（プロンプトに足す1段落。統合サマリーのプロンプト本体は変えない） */
export function mergeLengthInstruction(mode: MergeMode): string {
  const t = MERGE_TARGET[mode];
  return mode === 'summary'
    ? `\n\n【長さ】全体で${t.min.toLocaleString()}〜${t.max.toLocaleString()}字にまとめてください（要約。各セクションは簡潔に）。`
    : `\n\n【長さ】全体で${t.min.toLocaleString()}〜${t.max.toLocaleString()}字で詳しくまとめてください（詳細版。各資料の要点・根拠・数字・比較・実践手順まで踏み込み、途中で終わらず最後の「アクション推奨事項」まで書き切ること）。`;
}

/** 生成後の文字数と目標の関係（範囲外でも捨てない。表示だけ） */
export function mergeTargetState(chars: number, mode: MergeMode): { inRange: boolean; label: string } {
  const t = MERGE_TARGET[mode];
  if (chars < t.min) return { inRange: false, label: `目標外（${t.min.toLocaleString()}字未満）` };
  if (chars > t.max) return { inRange: false, label: `目標外（${t.max.toLocaleString()}字超）` };
  return { inRange: true, label: '目標内' };
}

/** 保存の形（283/286 のペアに乗せる）: 詳細＝本文（タグ「統合レポート」）／要約＝タグ「統合レポート,要約」。同じタイトル・同時保存 */
export const MERGE_DETAIL_TAGS = MERGE_REPORT_TAGS;
export const MERGE_SUMMARY_TAGS = `${MERGE_REPORT_TAGS},要約`;
export function mergeTagsOf(mode: MergeMode): string {
  return mode === 'summary' ? MERGE_SUMMARY_TAGS : MERGE_DETAIL_TAGS;
}
/** 出どころ（metadata・キー単位・R-113） */
export function mergeSaveMetadata(sourceIds: readonly string[], mode: MergeMode): Record<string, unknown> {
  return { summaryOf: { sourceIds: [...sourceIds] }, mergeKind: mode };
}
export interface MergeRun {
  status: 'running' | 'done' | 'error' | 'timeout';
  text: string;
  error?: string;
  savedId?: string;
}
export type MergeRuns = Partial<Record<MergeMode, MergeRun>>;
