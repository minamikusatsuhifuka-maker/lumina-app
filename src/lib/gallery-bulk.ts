// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 329: 画像ギャラリーの一括処理と絞り込み（DB 非依存・決定的・R-74/R-108）
//
// - 選べるのは一度に 50 件まで（超過は無効化＋理由・R-101）
// - 削除の確認は1回・件数入り（R-56）。1件ずつ独立に実行し、成功／失敗の件数を出す（R-39）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const GALLERY_SELECT_MAX = 50;
export const GALLERY_DOWNLOAD_INTERVAL_MS = 400;

export function gallerySelectOver(count: number): string | null {
  return count > GALLERY_SELECT_MAX ? `一度に選べるのは ${GALLERY_SELECT_MAX} 件までです（今は ${count} 件）` : null;
}
export function galleryDeleteConfirm(count: number): string {
  return `選んだ ${count} 件の画像を削除しますか？（画像本体も削除されます・元に戻せません）`;
}
export function galleryBulkResult(kind: '削除' | 'ダウンロード', ok: number, failed: number): string {
  return failed === 0 ? `${ok} 件を${kind}しました` : `${ok} 件を${kind}し、${failed} 件は失敗しました`;
}

/** 画像1件の種類（絞り込み用）。settings.visual.kind があればそれ、無ければモデルで推定 */
export type GalleryKind = 'image' | 'render' | 'other';
export function galleryKindOf(row: { settings?: { model?: string; visual?: { kind?: string } } | null }): GalleryKind {
  const k = row.settings?.visual?.kind;
  if (k === 'image-final' || k === 'image-original') return 'image';
  if (k === 'render') return 'render';
  const model = row.settings?.model ?? '';
  if (model === 'og-render') return 'render';
  if (model.startsWith('gpt-image')) return 'image';
  return 'other';
}
export const GALLERY_KIND_LABEL: Record<GalleryKind, string> = { image: 'イメージ画像（AI）', render: 'コード描画', other: 'その他' };

/** 比（327 の aspect があればそれ、無ければ幅高さから求める） */
export function galleryAspectOf(row: { width?: number | null; height?: number | null; settings?: { visual?: { aspect?: string } } | null }): string {
  const a = row.settings?.visual?.aspect;
  if (a) return a;
  const w = row.width ?? 0;
  const h = row.height ?? 0;
  if (!w || !h) return '不明';
  const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
  const d = g(w, h);
  return `${Math.round(w / d)}:${Math.round(h / d)}`;
}

export interface GalleryFilter {
  kind: GalleryKind | 'all';
  model: string;
  aspect: string;
}
export const GALLERY_FILTER_ALL: GalleryFilter = { kind: 'all', model: 'all', aspect: 'all' };
export function galleryMatches<T extends { settings?: { model?: string; visual?: { kind?: string; aspect?: string } } | null; width?: number | null; height?: number | null }>(row: T, f: GalleryFilter): boolean {
  if (f.kind !== 'all' && galleryKindOf(row) !== f.kind) return false;
  if (f.model !== 'all' && (row.settings?.model ?? '') !== f.model) return false;
  if (f.aspect !== 'all' && galleryAspectOf(row) !== f.aspect) return false;
  return true;
}
export function galleryFilterOptions<T extends { settings?: { model?: string; visual?: { kind?: string; aspect?: string } } | null; width?: number | null; height?: number | null }>(rows: readonly T[]): { kinds: GalleryKind[]; models: string[]; aspects: string[] } {
  const kinds = Array.from(new Set(rows.map((r) => galleryKindOf(r)))).sort();
  const models = Array.from(new Set(rows.map((r) => r.settings?.model ?? '').filter(Boolean))).sort();
  const aspects = Array.from(new Set(rows.map((r) => galleryAspectOf(r)))).sort();
  return { kinds, models, aspects };
}

/** 完成画像に紐づく元画像（315 の originalId）。削除の説明に使う */
export function galleryOriginalIdOf(row: { settings?: { visual?: { originalId?: string } } | null }): string | null {
  return row.settings?.visual?.originalId ?? null;
}
