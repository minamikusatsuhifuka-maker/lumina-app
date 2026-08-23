// 259: 「クリア」と「ペースト」を別々の操作にするための小さな純関数群。
//
// ── 3案の実測（WebKit＝iOS Safari と同じエンジン／Chromium）──────────────
// 指示書259-追記の3案を、実際にキーを送って機械判定した結果:
//
//   案① ふつうの <button> を長押し（＝院長案）
//        WebKit: paste イベント **0回**（届かない）／Chromium: 1回
//        → iOSでは成立しない。**paste は編集可能な領域にしか配送されない**ため。
//        ただし同じボタンに contenteditable を付けると WebKit でも **1回**届いた
//        ＝「見た目はボタン・実体は編集可能な空欄」にすれば院長案は成立する。
//
//   案② 空の1行入力へ長押し→ペースト
//        WebKit・Chromium とも paste **1回**、`clipboardData` から中身も読めた。
//        空欄なので iOS のメニューに「選択／すべてを選択」が出ず、「ペースト」だけになる
//        （本文の途中を長押しすると選択メニューが出て迷う、という258の不満の直接の答え）。
//
//   案③ ボタンから navigator.clipboard.readText()
//        WebKit・Chromium とも `NotAllowedError`（権限が要る）。
//        `document.execCommand('paste')` は両エンジンとも false ＝**確認を回避する道は無い**。
//        実機iOSでは確認ポップアップが出る。**回数はブラウザ側が決めるのでアプリからは減らせない。**
//
// → 採用: 案①と案②は同じ仕組みなので**1つに統合**し、「ボタンの見た目をした空の貼り付け欄」を
//   主経路にする（確認ポップアップ0回）。指示書259の「📋 ペースト」ボタン（案③）も併設する
//   （長押しが使えない場面の保険。ただし確認が1回以上入ることは避けられない）。

/** カーソル位置（選択範囲があればそこを置き換える）に差し込んだ結果 */
export interface InsertResult {
  next: string;
  /** 差し込んだ直後のカーソル位置 */
  caret: number;
}

/**
 * `current` の選択範囲に `insert` を差し込む。
 * 位置が取れないとき（null/範囲外）は**末尾に足す**——指示書259の
 * 「カーソル位置または末尾に貼り付ける」を、どんな入力でも満たせる形にする。
 */
export function insertAtCursor(
  current: string,
  insert: string,
  selectionStart?: number | null,
  selectionEnd?: number | null,
): InsertResult {
  if (!insert) return { next: current, caret: current.length };
  const len = current.length;
  const valid = (v: number | null | undefined): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= len;
  if (!valid(selectionStart)) {
    return { next: current + insert, caret: len + insert.length };
  }
  const start = selectionStart;
  const end = valid(selectionEnd) && selectionEnd >= start ? selectionEnd : start;
  const next = current.slice(0, start) + insert + current.slice(end);
  return { next, caret: start + insert.length };
}

/** 📋 ペーストボタン（案③）の結果と、画面に出す案内（2画面で同じ文言にする） */
export type PasteButtonResult = 'pasted' | 'empty' | 'denied';

export const PASTE_BUTTON_MESSAGE: Record<
  PasteButtonResult,
  { text: string; kind: 'success' | 'warning' }
> = {
  pasted: { text: '貼り付けました', kind: 'success' },
  empty: { text: 'クリップボードが空でした', kind: 'warning' },
  // 読めなかったときに黙って終わらせない。確認を出さずに済む道（長押し欄）へ案内する
  denied: {
    text: 'クリップボードを読めませんでした。下の「長押し →「ペースト」」欄をお使いください',
    kind: 'warning',
  },
};
