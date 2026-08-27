// 256: カードにカーソルを当てたときの本文プレビュー設定。
//
// 一覧で「▼全文表示」を開かなくても中身が分かるようにするための表示。
// 煩わしいと感じる場面があるため 🎛表示設定 でオン・オフを切り替えられる（院長指示）。
//
// 273: **既定をOFFに変更した**（院長指示「ポップアップ要約が本文に重なって読みにくい」）。
// 機能は残し、🎛表示設定でONに戻せる。既に自分で設定した人の値は上書きしない——
// 保存値が '1'（自分でONにした）ならON、'0'（自分でOFFにした）ならOFF、**未設定ならOFF**。
//
// 保存はテーマ・追従ボタン・自動ストック保存と同じ localStorage（このブラウザ単位）。

import { useCallback, useEffect, useState } from 'react';

export const HOVER_PREVIEW_KEY = 'lumina_hover_preview';
// 設定変更を同一タブ内の購読者へ即時通知する（auto-stock-save.ts と同方式）
export const HOVER_PREVIEW_EVENT = 'hover-preview-change';

/** カーソルを止めてから出るまでの待ち時間(ms)。
 *  一覧を眺めて動かしているだけで次々出ると煩わしいので、少し待ってから出す。
 *
 *  257: 500ms は「待たされる」と院長から指摘があったため 280ms に短縮した。
 *  下限を 250ms 未満にしなかったのは、一覧を横切るだけで次々出て煩わしくなるため
 *  （256の「眺めているだけで出ない」という要件を壊さない最小値）。 */
export const HOVER_PREVIEW_DELAY_MS = 280;

/** 本文の先読みを始めるまでの待ち時間(ms)。
 *  257: 表示（280ms）より先に取得を始めておくと、出た瞬間には本文が揃っていて
 *  「読み込み中…」がほぼ出ない。ただし0msにすると一覧を素早く横切るだけで
 *  カードの数だけ取得が走るため、「通り過ぎ」を弾く最小限の待ちを置く。 */
export const HOVER_PREVIEW_PREFETCH_MS = 80;

/** プレビューに出す本文の最大文字数（超えたら「…」で切る） */
export const HOVER_PREVIEW_CHARS = 400;

/** 273: 既定OFF（'1' が保存されているときだけON＝自分でONにした人の値は保つ） */
export function isHoverPreviewEnabled(): boolean {
  try {
    return localStorage.getItem(HOVER_PREVIEW_KEY) === '1';
  } catch {
    // 読めない環境（プライベートモード等）は既定に倒す＝出さない
    return false;
  }
}

export function setHoverPreviewEnabled(on: boolean) {
  try {
    localStorage.setItem(HOVER_PREVIEW_KEY, on ? '1' : '0');
  } catch {
    // 保存失敗時もタブ内の挙動は揃える（イベントは飛ばす）
  }
  window.dispatchEvent(new CustomEvent(HOVER_PREVIEW_EVENT, { detail: { enabled: on } }));
}

/**
 * 設定画面用。SSRとの描画差異を作らないため、確定するまで mounted=false を返す。
 */
export function useHoverPreviewSetting(): {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  mounted: boolean;
} {
  // 273: 既定OFF。確定前に「オン」と見せない（mounted を見てから出し分ける）
  const [enabled, setEnabledState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // localStorage はクライアントでしか読めない（レンダー中に読むとSSRとズレる）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledState(isHoverPreviewEnabled());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const onChange = (e: Event) => {
      const on = (e as CustomEvent).detail?.enabled;
      if (typeof on === 'boolean') setEnabledState(on);
    };
    window.addEventListener(HOVER_PREVIEW_EVENT, onChange);
    return () => window.removeEventListener(HOVER_PREVIEW_EVENT, onChange);
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    setHoverPreviewEnabled(on);
  }, []);

  return { enabled, setEnabled, mounted };
}

/**
 * プレビュー用に本文を整える。Markdownの記号は落として読める形にし（R-18/R-45）、
 * 長すぎるものは「…」で切る。空なら null（＝プレビューを出さない）。
 */
export function toPreviewText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // 連続する空行は1つに詰める（プレビューの縦を無駄に使わない）
  const compact = raw.replace(/\n{3,}/g, '\n\n').trim();
  if (!compact) return null;
  const chars = [...compact];
  if (chars.length <= HOVER_PREVIEW_CHARS) return compact;
  return `${chars.slice(0, HOVER_PREVIEW_CHARS).join('')}…`;
}

// ============================================================================
// 257: 表示位置の計算（純関数＝単体テストで機械判定できる形にする）
//
// 256は「カーソル座標＋16px」で出していた。これだと
//  - カードのどこから入ったかで出る場所が変わる（カードとの対応が分からない）
//  - 画面端では**カーソルを基準に箱ごと反転**するため、箱の高さ・幅ぶん
//    （実測で260〜396px）カードから離れた場所へ飛ぶ
// という2点で「離れた位置に出る」ようになっていた。
// 257では基準を**カードの矩形**に変え、カードの隣に貼り付ける。
// ============================================================================

/** プレビューの箱の大きさ（PreviewBox の指定と一致させること） */
export const HOVER_PREVIEW_WIDTH = 380;
export const HOVER_PREVIEW_MAX_HEIGHT = 260;
/** カードとプレビューの隙間(px)。三角のポインタがここを埋めて繋がって見える */
export const HOVER_PREVIEW_GAP = 10;
/** 画面端に残す余白(px) */
export const HOVER_PREVIEW_MARGIN = 8;

/**
 * 273§3: 240の「文字サイズ」はルート要素の CSS `zoom` で全体を拡大する方式。
 * このとき getBoundingClientRect は**拡大後（視覚）の座標**を返すのに対し、
 * `position: fixed` の left/top はズーム前（レイアウト）の値として解釈され、
 * 描画時に zoom 倍される。つまり素直に代入すると **座標が zoom 倍ずれる**
 * （実測: zoom=1.25 で style.left=310px → 実際は 388px に出る）。
 * 位置は視覚pxで決めて、styleに渡すときだけレイアウトpxへ戻す。
 */
export function rootZoom(): number {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return 1;
    const raw = getComputedStyle(document.documentElement).zoom;
    const z = Number.parseFloat(raw);
    return Number.isFinite(z) && z > 0 ? z : 1;
  } catch {
    return 1;
  }
}

/** 視覚px → レイアウトpx（style に渡す値）。zoom が 1 のときは何も変えない */
export function toLayoutPx(visual: number, zoom: number): number {
  return zoom > 0 ? visual / zoom : visual;
}

export type PreviewRect = { left: number; top: number; width: number; height: number };
export type PreviewSide = 'right' | 'left' | 'bottom' | 'top';
export type PreviewPlacement = { left: number; top: number; side: PreviewSide };

const clampNum = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * カードの矩形に**隣接**する位置を返す。
 * 優先順は 右 → 左 → 下 → 上（指示書257の要件）。どこにも収まらないときだけ、
 * 余白の広い側へ寄せて画面内にクランプする（この場合だけカードに重なりうるが、
 * プレビューは pointer-events:none なので操作は妨げない）。
 */
export function computePreviewPlacement(
  card: PreviewRect,
  viewport: { width: number; height: number },
  box: { width?: number; height?: number } = {},
): PreviewPlacement {
  const w = box.width ?? HOVER_PREVIEW_WIDTH;
  const h = box.height ?? HOVER_PREVIEW_MAX_HEIGHT;
  const gap = HOVER_PREVIEW_GAP;
  const m = HOVER_PREVIEW_MARGIN;
  const cardRight = card.left + card.width;
  const cardBottom = card.top + card.height;

  // 縦（左右に置くとき）: カードの上端に揃え、画面からはみ出す分だけ戻す
  const alignTop = () => clampNum(card.top, m, Math.max(m, viewport.height - h - m));
  // 横（上下に置くとき）: カードの左端に揃え、画面からはみ出す分だけ戻す
  const alignLeft = () => clampNum(card.left, m, Math.max(m, viewport.width - w - m));

  if (cardRight + gap + w <= viewport.width - m) {
    return { side: 'right', left: cardRight + gap, top: alignTop() };
  }
  if (card.left - gap - w >= m) {
    return { side: 'left', left: card.left - gap - w, top: alignTop() };
  }
  if (cardBottom + gap + h <= viewport.height - m) {
    return { side: 'bottom', left: alignLeft(), top: cardBottom + gap };
  }
  if (card.top - gap - h >= m) {
    return { side: 'top', left: alignLeft(), top: card.top - gap - h };
  }
  // 収まりきらない（カードが画面いっぱい）: 余白の広い側へ
  const maxLeft = Math.max(m, viewport.width - w - m);
  if (viewport.width - cardRight >= card.left) {
    return { side: 'right', left: clampNum(cardRight + gap, m, maxLeft), top: alignTop() };
  }
  return { side: 'left', left: clampNum(card.left - gap - w, m, maxLeft), top: alignTop() };
}

/**
 * 三角のポインタを置く位置（プレビューの箱の中での座標）。
 * カードと箱が重なっている範囲の中央に置く＝どのカードから出ているかが分かる。
 */
export function computeArrowOffset(
  card: PreviewRect,
  placement: PreviewPlacement,
  boxSize: { width: number; height: number },
  arrow = 8,
): number {
  const horizontal = placement.side === 'right' || placement.side === 'left';
  const cardStart = horizontal ? card.top : card.left;
  const cardEnd = cardStart + (horizontal ? card.height : card.width);
  const boxStart = horizontal ? placement.top : placement.left;
  const boxLen = horizontal ? boxSize.height : boxSize.width;
  // 重なりの中央（重なりが無ければカードの中央）
  const overlapStart = Math.max(cardStart, boxStart);
  const overlapEnd = Math.min(cardEnd, boxStart + boxLen);
  const center =
    overlapEnd > overlapStart ? (overlapStart + overlapEnd) / 2 : (cardStart + cardEnd) / 2;
  return clampNum(center - boxStart - arrow, 10, Math.max(10, boxLen - arrow * 2 - 10));
}
