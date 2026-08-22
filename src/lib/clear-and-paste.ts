// 254: 「📋 クリアして貼付」= 入力欄を空にして、クリップボードの内容を入れ、カーソルを末尾へ。
//
// ── 貼り付け方式の選定（実測にもとづく・248と同じ流儀）─────────────────
// Chromium(Mac) に実際にキーを送り、textarea の値がどう変わるかを機械判定した:
//   ・⌘⇧V / ⌥V / ⌘⇧Enter / Ctrl+⇧V … いずれも textarea 上で**何も起きない**（奪う既定動作なし）
//   ・⌘V … 貼り付け（当然。これは絶対に奪わない）
//   ・textarea を select() してから ⌘V … 選択範囲が置き換わり「クリア＋貼付」になる
//   ・navigator.clipboard.readText() … 権限ありで成功、権限なしは NotAllowedError
//   ・クリップボードが空のときは何も入らない（＝元の内容が壊れるようなことは起きない）
//
// 指示書の案Bは「キー押下時にクリアしてブラウザ標準の貼り付けを通す」だったが、
// **標準の貼り付けを起こせるのは ⌘V だけ**で、⌘V は奪ってはいけないキー。
// ⌘⇧V に対して既定の貼り付けは走らない（実測）ので、案Bは成立しない。
// そこで readText() を主軸にし、権限が無い場合だけ案A（クリアしてフォーカスし、
// 「⌘Vで貼り付けてください」と案内）へ落とす。**ボタンもキーも同じ関数を通す**ので
// 挙動が分かれない（247の流儀）。
//
// どの結果でも消えた内容は Undo（↩ 元に戻す・10秒）で戻せる＝壊れない。

/** 実行結果。画面はこれを見て案内文を出す */
export type ClearAndPasteResult =
  /** クリップボードの内容で置き換えた */
  | 'pasted'
  /** クリップボードは読めなかった。クリアしてフォーカスまで済ませたので ⌘V を押せばよい */
  | 'cleared-manual'
  /** クリップボードが空だった。クリアだけ済んでいる */
  | 'empty'
  /** 入力が元から空で、やることが無かった */
  | 'noop';

/**
 * クリップボードのテキストを読む。読めなければ null（権限拒否・未対応・例外すべて）。
 * 失敗を握りつぶすのは、呼び出し側が案A（手動貼り付け）へ落とすため。
 */
export async function readClipboardText(): Promise<string | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return null;
    const text = await navigator.clipboard.readText();
    return typeof text === 'string' ? text : null;
  } catch {
    // NotAllowedError（権限拒否）/ SecurityError / 非対応ブラウザ
    return null;
  }
}

export interface ClearAndPasteOptions {
  /** いまの入力内容（Undo用に退避する） */
  current: string;
  /** 入力内容を書き換える（クリアと貼り付けの両方でこれを通す） */
  setText: (next: string) => void;
  /** 対象の入力欄。フォーカスとカーソル末尾移動に使う */
  textareaRef: { current: HTMLTextAreaElement | HTMLInputElement | null };
  /** 消した内容の退避（画面側の Undo に渡す）。入力が空のときは呼ばれない */
  backup: (text: string) => void;
}

/**
 * クリアして貼り付ける。**先にクリップボードを読んでから**入力を触るので、
 * 権限拒否でも「消えただけで貼れない」状態にはならない（消す前に結果が分かる）。
 */
export async function clearAndPaste(
  options: ClearAndPasteOptions,
): Promise<ClearAndPasteResult> {
  const { current, setText, textareaRef, backup } = options;

  // 読み取りはユーザー操作（クリック/キー押下）の直後に呼ばれる前提。
  // ここで先に読むことで、権限拒否のときに入力を消すかどうかを選べる。
  const clip = await readClipboardText();

  const hasCurrent = current.length > 0;
  if (hasCurrent) backup(current);

  const focusEnd = (value: string) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    // カーソルを末尾に置く（要件: 貼り付けた続きから書ける）
    try {
      el.setSelectionRange(value.length, value.length);
    } catch {
      /* type によっては setSelectionRange が使えない。フォーカスだけで十分 */
    }
  };

  // 権限が無い・非対応 → 案A: クリアしてフォーカスまで済ませ、⌘V は本人に押してもらう
  if (clip === null) {
    if (!hasCurrent) {
      focusEnd('');
      return 'noop';
    }
    setText('');
    // state 反映後に DOM を触るため、次のフレームで実行する
    requestAnimationFrame(() => focusEnd(''));
    return 'cleared-manual';
  }

  if (clip.length === 0) {
    if (!hasCurrent) {
      focusEnd('');
      return 'noop';
    }
    setText('');
    requestAnimationFrame(() => focusEnd(''));
    return 'empty';
  }

  setText(clip);
  requestAnimationFrame(() => focusEnd(clip));
  return 'pasted';
}

/** 結果に対する画面の案内文（3画面で同じ文言にする） */
export const CLEAR_PASTE_MESSAGE: Record<
  ClearAndPasteResult,
  { text: string; kind: 'success' | 'warning' | 'info' } | null
> = {
  pasted: { text: 'クリアして貼り付けました', kind: 'success' },
  'cleared-manual': {
    text: 'クリアしました。クリップボードを読めなかったので ⌘V（Ctrl+V）で貼り付けてください',
    kind: 'warning',
  },
  empty: { text: 'クリップボードが空でした。クリアだけ行いました', kind: 'warning' },
  noop: null,
};
