// 295 §2-4: 🧠AI参照素材（context_saves）の「生成元」を1箇所で決める（純関数・決定的・R-74）。
// 従来 ContextLibraryPanel 内にあった originLabel をそのまま lib に移した（判定は不変）。
// 比較パネルの列ヘッダー（LibraryCompareView の kind/label）にもこの判定を使う＝一覧のバッジと同じ語。
//
// context_saves は概ね「ディープリサーチ → コンテキスト最適化 → 保存」由来で、テーブルに生成元の列は無い。
// タグ `batch:<jobId>` があればバッチ実行と判定するベストエフォート（DBに実体が無いので種別フィルタは作らない・§2-7）。

export type ContextOriginKind = 'batch' | 'deepresearch';

export const CONTEXT_ORIGIN_LABEL: Record<ContextOriginKind, { icon: string; label: string }> = {
  batch: { icon: '📚', label: 'ディープリサーチ（バッチ）' },
  deepresearch: { icon: '🔭', label: 'ディープリサーチ' },
};

/** タグから生成元の種別を決める。同じタグ配列なら必ず同じ結果 */
export function contextOriginKind(tags: string[] | null | undefined): ContextOriginKind {
  const ts = Array.isArray(tags) ? tags : [];
  return ts.some((t) => typeof t === 'string' && t.startsWith('batch:')) ? 'batch' : 'deepresearch';
}

/** 一覧の「生成元: 📚 ディープリサーチ（バッチ）」バッジ用（従来の originLabel と同じ戻り値） */
export function originLabel(tags: string[] | null | undefined): { icon: string; label: string } {
  return CONTEXT_ORIGIN_LABEL[contextOriginKind(tags)];
}
