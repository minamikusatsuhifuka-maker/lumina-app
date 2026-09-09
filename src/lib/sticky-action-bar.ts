// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 313: 画面下部の固定アクションバー（共通部品 StickyActionBar）の判定・定数（DB 非依存・決定的・R-74）
//
// - 狭幅の判定は**画面幅ではなく主カラム（部品を置いた容器）の幅**（305是正②と同じ・ResizeObserver）。
//   容器が display:none のとき幅は 0 ＝「狭幅ではない」＝バーを出さない（別タブでは出ない）。
// - キーボード表示中（本文欄などテキスト入力にフォーカスがある間）は出さない。iOS ではキーボードの上に
//   fixed の要素が残って入力欄を隠すため。閉じたら出す。
// - 「↑」などの追従ボタンは、バーの高さを CSS 変数（STICKY_BAR_HEIGHT_VAR）で受け取ってバーの上へ逃がす
//   （ThemeProvider.floatingBottom が足す）。バー側は変数を書くだけで、追従ボタンの座標を直接触らない。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 容器の幅がこれ未満なら「狭幅」＝下部固定バー（305 の MANDALA_NARROW_MIN_WIDTH と同値・iPad 縦の主カラムは広幅） */
export const STICKY_BAR_NARROW_MAX_WIDTH = 640;
/** 追従ボタン（↑ 等）がバーの上へ逃げるための CSS 変数（documentElement に書く・出ていない間は無い＝0px） */
export const STICKY_BAR_HEIGHT_VAR = '--lumina-sticky-bar-h';
/** バーの上下の内側余白。下側は iOS のセーフエリア分を足す */
export const STICKY_BAR_PADDING = 10;
/** 結果領域の下端がバーに隠れないよう、容器の下に足す余白（バーの高さ＋この値） */
export const STICKY_BAR_RESERVE_EXTRA = 12;
/** 追従ボタン等より下・モーダルより下（HoverPopover 等の 10000 台には掛けない） */
export const STICKY_BAR_Z_INDEX = 9000;

export function isStickyBarNarrow(containerWidth: number): boolean {
  return containerWidth > 0 && containerWidth < STICKY_BAR_NARROW_MAX_WIDTH;
}

/** バーを出すか（狭幅で、テキスト入力にフォーカスが無い間） */
export function shouldShowStickyBar(narrow: boolean, editing: boolean): boolean {
  return narrow && !editing;
}

/** キーボードを呼ぶ要素か（focusin の対象で判定。チェックボックス・ボタンは含めない） */
export function isTextEntryTarget(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const t = (el.type ?? 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'hidden', 'image'].includes(t);
  }
  return false;
}

/** バーの下側の余白（iOS のセーフエリアを確保・R-64） */
export function stickyBarPaddingBottom(): string {
  return `calc(${STICKY_BAR_PADDING}px + env(safe-area-inset-bottom, 0px))`;
}

/** 容器の下に足す余白（px）。バーの実測高さ＋余白 */
export function stickyBarReserve(barHeightPx: number): number {
  return barHeightPx > 0 ? Math.ceil(barHeightPx) + STICKY_BAR_RESERVE_EXTRA : 0;
}

/** 分析実行ボタンの無効化の理由（R-101）。null＝押せる */
export function runDisabledReason(input: { loading: boolean; hasText: boolean; typeCount: number }): string | null {
  if (input.loading) return '分析中です（完了までお待ちください）';
  if (!input.hasText) return '分析するテキストを入力してください';
  if (input.typeCount === 0) return '分析タイプを1つ以上選択してください';
  return null;
}
