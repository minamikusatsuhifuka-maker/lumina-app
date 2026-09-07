// 300: 即時ツールチップの位置計算（純関数＝単体テストで機械判定できる形）
//
// ── 何を解決するか ─────────────────────────────────────────
// アプリのボタン・バッジの説明は全てブラウザ標準の `title` 属性（300調査時点で 393箇所・109ファイル）。
// `title` の吹き出しは OS/ブラウザが約1秒待ってから出すもので、アプリ側で遅延を制御できない。
// 300では `title` をそのまま残し、カーソルが乗った瞬間に**自前の吹き出し**を出す（InstantTooltip）。
// 個別の置き換え（393箇所）はせず、共通部品1つで全画面に効かせる（R-88/R-91）。
//
// ── 257のホバープレビューとは別物 ────────────────────────
// あちらは「記事本文400字・意図的な遅延（先読み80ms／表示280ms）・既定OFF」。本便は「数語の説明・遅延なし・常時」。
// 257の HOVER_PREVIEW_DELAY_MS / HOVER_PREVIEW_PREFETCH_MS は触らない。
//
// ── 座標系（R-80）────────────────────────────────────────
// 位置は視覚px（getBoundingClientRect）で決め、style に渡すときだけ toLayoutPx でレイアウトpxへ戻す
// （273 の rootZoom / toLayoutPx を再利用。ここでは視覚pxだけを扱う）。

/** 吹き出しとボタンの隙間(px・レイアウト基準。zoom 時は呼び出し側が zoom 倍する) */
export const INSTANT_TIP_GAP = 6;
/** 画面端に残す余白(px) */
export const INSTANT_TIP_MARGIN = 8;
/** 吹き出しの最大幅(px) */
export const INSTANT_TIP_MAX_WIDTH = 280;
/** 吹き出し要素の目印（E2E・CSS） */
export const INSTANT_TIP_ATTR = 'data-instant-tip';
/** `title` を退避する属性。ホバー中だけ `title` を外して標準の吹き出し（遅い方）を出させない */
export const INSTANT_TIP_STASH_ATTR = 'data-tip';

export type TipRect = { left: number; top: number; width: number; height: number };
export type TipSide = 'bottom' | 'top';
export type TipPlacement = { left: number; top: number; side: TipSide };

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * ボタン（anchor）の下に中央揃えで置く。下に入らなければ上。左右は画面端の余白の内側に収める。
 * すべて同じ座標系（視覚px）で渡すこと。
 */
export function computeTipPlacement(
  anchor: TipRect,
  viewport: { width: number; height: number },
  tip: { width: number; height: number },
  gap = INSTANT_TIP_GAP,
  margin = INSTANT_TIP_MARGIN,
): TipPlacement {
  const below = anchor.top + anchor.height + gap;
  const fitsBelow = below + tip.height <= viewport.height - margin;
  const above = anchor.top - gap - tip.height;
  const side: TipSide = fitsBelow || above < margin ? 'bottom' : 'top';
  const top = side === 'bottom' ? Math.min(below, Math.max(margin, viewport.height - margin - tip.height)) : above;
  const centered = anchor.left + anchor.width / 2 - tip.width / 2;
  const maxLeft = Math.max(margin, viewport.width - margin - tip.width);
  const left = clamp(centered, margin, maxLeft);
  return { left, top, side };
}

/** `title` の文言として吹き出しに出す価値があるか（空・空白だけは出さない） */
export function isTipText(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.trim().length > 0;
}
