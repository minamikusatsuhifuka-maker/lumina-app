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
