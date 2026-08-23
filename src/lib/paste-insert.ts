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
// 259の採用: 案①と案②を統合し「ボタンの見た目をした空の貼り付け欄」を主経路にした。
//
// ── 260: その主経路を撤去し、「📋 ペースト」ボタン1本に一本化した ────────────
// 実機で分かったこと: **編集可能な欄はタップするとiOSのキーボードが立ち上がる**。
// キーボードがせり上がって欄の位置がずれ、押し直しが要る＝かえって手数が増えた。
//
// 260で測った代替（WebKit／Chromium とも同じ結果）:
//   案B readonly な入力欄 … paste は **1回届き**、中身も読めた（欄には入らない＝都合がよい）
//   案C inputmode="none" … paste **1回**・読み取り成功
//   案C' contenteditable(+plaintext-only) … paste **1回**・読み取り成功
//   参考 disabled な入力欄 … WebKit では paste **0回**（＝完全に届かない）
//
// **測れるところでは案B・案Cとも成立する。それでも採用しなかった理由**:
//   - ここで送っている ⌘V は**ハードウェアキーボードからの貼り付け**。実機のiPhoneには
//     それが無く、貼り付けを起こす唯一の手段は**長押しのメニューに「ペースト」が出ること**。
//     このメニューはOSが描くので、ヘッドレスからは観測できない（測れないものを測れたと書かない）。
//   - 案Bの readonly は「ユーザーが書き換えられない欄」なので、iOSがそのメニューに
//     「ペースト」を出すとは考えにくい（出なければ実機では貼り付ける手段が消える）。
//   - 案Cの inputmode="none" はキーボードを抑える指定だが、**編集可能な欄である**ことは変わらず、
//     258（選択メニューに阻まれる）・259（キーボードが出る）に続いて
//     **観測できないOSのUIに三度賭ける**ことになる。
//   - 対して「📋 ペースト」ボタンは編集可能な要素を一切使わないので、
//     **キーボードが出る余地が構造的に無い**（＝指示書260の最優先条件を、期待ではなく構造で満たす）。
//
// 残る限界（これ以上は減らせない）: ボタンから読むには `readText()` が要り、
// **確認ポップアップは避けられない**（`execCommand('paste')` は両エンジンで false ＝
// 確認を回避する道が無いことを259で実測済み）。回数を決めるのはOSで、アプリからは触れない。

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
  // 読めなかった（確認で「許可しない」を選んだ等）ときに黙って終わらせない。
  // 260: 案内先はiPhoneの標準操作。アプリ側の欄は撤去したので、本文欄そのものを長押ししてもらう
  denied: {
    text: 'クリップボードを読めませんでした。入力欄を長押しして「ペースト」を選んでください',
    kind: 'warning',
  },
};
