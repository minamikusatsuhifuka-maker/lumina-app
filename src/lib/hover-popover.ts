// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 304: 対話要素（リンク・ボタン）を載せるホバーポップアップの定数と判断（DB 非依存・純関数）
//
// 257 の HoverPreview（本文の冒頭・pointer-events:none・既定OFF設定に連動）と、300 の InstantTooltip（title 由来・即時・
// 読むだけ）は、どちらも「押せない吹き出し」。本便のポップアップは**行を押してリンク先へ飛ぶ**対話要素なので別部品
// （components/HoverPopover.tsx）とし、両者の設定・定数を混ぜない（R-110）。
// 位置は 273 の computePreviewPlacement（右→左→下→上で隣接・画面内へクランプ）をそのまま使い、
// zoom 補正は rootZoom / toLayoutPx（R-80）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { computePreviewPlacement, type PreviewPlacement, type PreviewRect } from './hover-preview';

/** カーソルを合わせてから出すまで（§2-2: 150〜250ms）。257 の 280ms より短い＝眺めるより「見に行く」操作のため */
export const HOVER_POPOVER_DELAY_MS = 180;
/** バッジ→ポップアップへカーソルを移す間の猶予。これより短いと隙間で消えて使えない（§2-2） */
export const HOVER_POPOVER_CLOSE_GRACE_MS = 200;
/** 箱の幅（px・レイアウト）。リンクのタイトル1行が読める幅 */
export const HOVER_POPOVER_WIDTH = 340;
export const HOVER_POPOVER_MAX_HEIGHT = 360;
/** ポップアップの z-index。サイドパネル（9000）・ホバープレビュー（9997）より上、全画面リーダー（10000）より下 */
export const HOVER_POPOVER_Z = 9998;

/**
 * 位置（視覚px）。anchor はバッジの矩形、box は zoom を掛けた実寸。
 * 273 の関数をそのまま呼ぶ薄い包み＝新しい位置計算を書かない（R-91）
 */
export function computePopoverPlacement(
  anchor: PreviewRect,
  viewport: { width: number; height: number },
  boxVisual: { width: number; height: number },
): PreviewPlacement {
  return computePreviewPlacement(anchor, viewport, boxVisual);
}
