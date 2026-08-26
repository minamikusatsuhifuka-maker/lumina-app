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
// そこで readText() を主軸にする。**ボタンもキーも同じ関数を通す**ので挙動が分かれない（247の流儀）。
//
// ── 270【最重要】: 破壊的操作（クリア）は「貼るものが手に入ってから」だけ行う ──────
// 254〜260は、クリップボードを**読めなかったときもクリアしていた**（案A＝「クリアして
// フォーカスまで済ませ、⌘V は本人に押してもらう」）。デスクトップでは権限拒否のときだけの
// 話だったが、**iOSでは確認ポップアップを「許可しない」で閉じるたびに同じ経路に落ちる**。
// 270でiOSにも「📋 クリアして貼付」を置く以上、これは
// 「長文を書いたあと、確認をキャンセルしただけで全部消える」事故そのものになる。
//
// そこで順序と条件を次のとおりに固定した:
//   1. まずクリップボードを読む（readText）→ iOSはここでOS確認が出る
//   2. **読めて、中身があったときだけ** 入力欄をクリアして貼り付ける
//   3. キャンセル・権限拒否・空クリップボード → **入力欄には一切触れない**
// フォーカスも当てない（iOSでは focus() がキーボードを立ち上げ、画面が動いてしまうため）。
// 貼り付けに成功したときだけ、消えた内容は Undo（↩ 元に戻す・10秒）で戻せる。
// これは R-76 として規約化した（デスクトップ・iOSで同じ順序＝環境で分岐しない）。

/** 実行結果。画面はこれを見て案内文を出す */
export type ClearAndPasteResult =
  /** クリップボードの内容で置き換えた（このときだけ入力欄を触る） */
  | 'pasted'
  /** クリップボードを読めなかった（権限拒否・iOSの確認をキャンセル・非対応）。入力欄は元のまま */
  | 'denied'
  /** クリップボードが空だった。貼るものが無いので入力欄は元のまま */
  | 'empty';

/**
 * クリップボードのテキストを読む。読めなければ null（権限拒否・未対応・例外すべて）。
 * 失敗を握りつぶすのは、呼び出し側が「入力欄に触れない」判断をするため。
 */
export async function readClipboardText(): Promise<string | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return null;
    const text = await navigator.clipboard.readText();
    return typeof text === 'string' ? text : null;
  } catch {
    // NotAllowedError（権限拒否・iOSの確認をキャンセル）/ SecurityError / 非対応ブラウザ
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
 * クリアして貼り付ける。**貼るものが手に入ったときだけ**入力を触る（270・R-76）。
 * 読めなかった・空だったときは入力欄・フォーカスとも一切変更しない
 * ＝ iOSで確認をキャンセルしても本文が消えない。
 */
export async function clearAndPaste(
  options: ClearAndPasteOptions,
): Promise<ClearAndPasteResult> {
  const { current, setText, textareaRef, backup } = options;

  // 読み取りはユーザー操作（クリック/キー押下）の直後に呼ばれる前提。
  // ここで先に読むことで、入力を消してよいかどうかを**消す前に**確定できる。
  const clip = await readClipboardText();

  // 貼るものが無い2経路。入力欄もフォーカスも触らない（案内だけ出す）
  if (clip === null) return 'denied';
  if (clip.length === 0) return 'empty';

  if (current.length > 0) backup(current);
  setText(clip);
  // state 反映後に DOM を触るため、次のフレームで実行する
  requestAnimationFrame(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    // カーソルを末尾に置く（要件: 貼り付けた続きから書ける）
    try {
      el.setSelectionRange(clip.length, clip.length);
    } catch {
      /* type によっては setSelectionRange が使えない。フォーカスだけで十分 */
    }
  });
  return 'pasted';
}

/** 結果に対する画面の案内文（3画面で同じ文言にする） */
export const CLEAR_PASTE_MESSAGE: Record<
  ClearAndPasteResult,
  { text: string; kind: 'success' | 'warning' | 'info' }
> = {
  pasted: { text: 'クリアして貼り付けました', kind: 'success' },
  // 270: 「消していない」ことを最初に伝える（消えたかどうかが利用者の一番の関心事のため）
  denied: {
    text: 'クリップボードを読み取れませんでした。入力はそのままです（「✕ クリア」→ ⌘V で置き換えられます）',
    kind: 'warning',
  },
  empty: { text: 'クリップボードが空でした。入力はそのままです', kind: 'warning' },
};
