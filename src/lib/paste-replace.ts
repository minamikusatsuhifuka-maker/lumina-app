// 255: 「貼り付けたら前の内容を置き換える」設定（既定OFF）。
//
// ── 何を解決するか ─────────────────────────────────────────
// 254の「📋 クリアして貼付」は iPhone Safari で2タップになる。
// iOS は `navigator.clipboard.readText()` に対して**必ず**ユーザー確認のポップアップを出す
// （Appleのクリップボード保護。Webアプリ側では無効化できない）。ボタンのタップ＋確認のタップで2回。
//
// ── 実測して選んだ方式（案A）────────────────────────────────
// Chromium と WebKit（＝iOS Safari と同じエンジン）の両方に実際のペースト操作を送り、
// `paste` イベント内の `clipboardData.getData('text/plain')` が読めるかを機械判定した結果:
//   ・**権限もプロンプトも無しに読める**（両エンジンとも成功）
//   ・`preventDefault()` してから値を差し替えれば「クリア＋貼付」と同じ結果になる
// つまり **ユーザーが普段どおり長押し→ペーストするだけで置き換えが完了する**＝追加タップゼロ。
// iOSの確認ポップアップは「標準の貼り付け操作」の一部なので、そもそも増えない。
//
// ── なぜ既定OFFか ──────────────────────────────────────
// この設定をONにすると、**通常の「追記したい貼り付け」も置き換えになる**。
// 院長の使い方（分析したい文章を丸ごと入れ替える）では便利だが、既定で全員の
// 貼り付けの意味を変えるのは危険なので、選んだ人だけがONにする形にした。
// ONのときも消えた内容は247のUndo（10秒）で戻せる。
//
// 不採用: 入力欄をタップした時点で自動クリア（指示書の案B）
//   = 「読もうとしてタップしただけ」で本文が消える。Undoがあっても事故の頻度が高すぎる。
// 不採用: UA判定でiOSのときだけ挙動を変える
//   = UA判定は脆いうえ、同じ操作が端末によって別の結果になる（説明できない画面になる）。
//     設定にすれば分岐そのものが要らない。

import { useCallback, useEffect, useState } from 'react';

export const PASTE_REPLACE_KEY = 'lumina_paste_replace';
// 設定変更を同一タブ内の購読者へ即時通知する（auto-stock-save.ts と同方式）
export const PASTE_REPLACE_EVENT = 'paste-replace-change';

/** 既定OFF（'1' が保存されているときだけON） */
export function isPasteReplaceEnabled(): boolean {
  try {
    return localStorage.getItem(PASTE_REPLACE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPasteReplaceEnabled(on: boolean) {
  try {
    localStorage.setItem(PASTE_REPLACE_KEY, on ? '1' : '0');
  } catch {
    // 保存失敗時もタブ内の挙動は揃える（イベントは飛ばす）
  }
  window.dispatchEvent(new CustomEvent(PASTE_REPLACE_EVENT, { detail: { enabled: on } }));
}

/**
 * 設定画面・入力欄の両方から使う。SSRとの描画差異を作らないため、
 * 確定するまで mounted=false を返す（設定画面は「読み込み中…」を出す）。
 */
export function usePasteReplace(): {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  mounted: boolean;
} {
  const [enabled, setEnabledState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // localStorage はクライアントでしか読めない。レンダー中に読むとSSRとズレるため、
    // マウント後に1回だけ反映する（auto-stock-save.ts と同じ形）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledState(isPasteReplaceEnabled());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const onChange = (e: Event) => {
      const on = (e as CustomEvent).detail?.enabled;
      if (typeof on === 'boolean') setEnabledState(on);
    };
    window.addEventListener(PASTE_REPLACE_EVENT, onChange);
    return () => window.removeEventListener(PASTE_REPLACE_EVENT, onChange);
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    setPasteReplaceEnabled(on);
  }, []);

  return { enabled, setEnabled, mounted };
}

/**
 * `onPaste` に渡すハンドラの中身。置き換えたときだけ true を返す
 * （false のときは何もしていない＝ブラウザの通常の貼り付けがそのまま走る）。
 *
 * 置き換えるのは「設定ON」かつ「いま入力がある」かつ「貼るテキストがある」ときだけ。
 * 空の入力欄への貼り付けは置き換えるものが無いので素通しし、
 * 空クリップボードのときも素通しする（本文を消して終わり、を作らない）。
 */
export function applyReplacePaste(options: {
  enabled: boolean;
  current: string;
  clipboardText: string;
  setText: (next: string) => void;
  backup: (text: string) => void;
  /** 置き換え後にカーソルを末尾へ置く（省略可） */
  focusEnd?: (next: string) => void;
}): boolean {
  const { enabled, current, clipboardText, setText, backup, focusEnd } = options;
  if (!enabled) return false;
  if (!current) return false;
  if (!clipboardText) return false;
  backup(current);
  setText(clipboardText);
  focusEnd?.(clipboardText);
  return true;
}
