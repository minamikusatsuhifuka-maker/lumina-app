// 204: キーボードショートカットの共通基盤。
// 方針:
// - 誤爆防止が最優先: 入力中（input/textarea/select/contenteditable・IME変換中）は
//   単独キーのショートカットを発火させない（isTypingTarget で全ハンドラが共通判定）
// - 破壊的操作（削除・適用・生成開始）にはキーを割り当てない
// - 設定は localStorage（149ホームカテゴリ編集と同方式・DBに載せない）。既定ON。
//   OFFのときは新設ショートカットを一切発火させない。
//   ただし FullscreenReader の Esc（151の既存機能）は常に有効＝この設定の対象外
// - キーハンドラは各画面に散らさず、この基盤＋設置点3箇所
//   （KeyboardShortcuts=全体 / FullscreenReader=リーダー内 / NoteBundleDock=選択モード）に集約

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export const KB_ENABLED_KEY = 'kb_shortcuts_enabled';
// 設定変更を同一タブ内の購読者へ即時通知するためのイベント
export const KB_ENABLED_EVENT = 'kb-enabled-change';
// ヘルプモーダルをボタン等から開くためのイベント（?キーと同じ内容）
export const KB_HELP_EVENT = 'kb-help-open';

// 既定ON（'0' が保存されているときのみOFF）
export function isShortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(KB_ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setShortcutsEnabled(on: boolean) {
  try {
    localStorage.setItem(KB_ENABLED_KEY, on ? '1' : '0');
  } catch {
    // 保存失敗時もタブ内の挙動は揃える（イベントは飛ばす）
  }
  window.dispatchEvent(new CustomEvent(KB_ENABLED_EVENT, { detail: { enabled: on } }));
}

// 入力中判定（最大の誤爆リスク対策）。IME変換中(isComposing)も入力中とみなす
export function isTypingTarget(e: KeyboardEvent): boolean {
  if (e.isComposing) return true;
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return t.isContentEditable;
}

// 204 3層の見せ方・第1層: 既存ボタンのツールチップ/placeholderへのキー併記。
// 表記はここに一元管理し、ツールチップ・?モーダル・使い方ガイドが同じソースを見る（二重管理しない）
export const KEY_HINT = {
  readerClose: 'Esc / ⌘←', // リーダー✕ボタン: 「閉じる（Esc / ⌘←）」
  readerOpenSuffix: '（Esc または ⌘← で閉じる）', // ⛶全画面ボタンの末尾
  fontSuffix: '（+ / -）', // 文字サイズボタンの末尾
  searchSuffix: '（/ でフォーカス）', // 検索placeholderの末尾
} as const;

// キー併記を表示してよいか。
// - 設定OFFのときは消す（効かないキーを案内しない＝嘘の案内をしない）
// - キーボードが無い環境（モバイル等・hover/fine pointer非対応）では出さない
// SSR/初期描画は常に false（サーバとクライアントの描画差異を作らない）
export function useShortcutHints(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const update = () => {
      const desktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      setShow(desktop && isShortcutsEnabled());
    };
    update();
    window.addEventListener(KB_ENABLED_EVENT, update);
    return () => window.removeEventListener(KB_ENABLED_EVENT, update);
  }, []);
  return show;
}

// ショートカット一覧（小窓・使い方ガイド・ツールチップがすべてここを参照＝二重管理しない）。
// scope は「現在の画面で有効か」を小窓が淡色表示で区別するための対象画面。
// 判定は data-kb-scope="reader"（リーダー表示中）・可視の data-kb-search（一覧画面）・
// 可視の data-kb-run（生成/実行画面の実行ボタン）で行う
export type ShortcutScope = 'reader' | 'list' | 'run' | 'global';
export const SHORTCUT_SECTIONS: Array<{
  title: string;
  scope: ShortcutScope;
  items: Array<{ keys: string[]; desc: string; note?: string }>;
}> = [
  {
    title: '全画面リーダー（⛶）',
    scope: 'reader',
    items: [
      { keys: ['Esc'], desc: '閉じる', note: '設定OFFでも常に有効' },
      { keys: ['⌘', '←'], desc: '閉じる（ブラウザの「戻る」で閉じる）' },
      { keys: ['j'], desc: '次の資料へ' },
      { keys: ['k'], desc: '前の資料へ' },
      { keys: ['+', '−'], desc: '文字サイズ 大 / 小' },
    ],
  },
  {
    title: '一覧画面（🗂テキスト分析・🧠AI参照素材）',
    scope: 'list',
    items: [
      { keys: ['/'], desc: '検索ボックスにフォーカス' },
      { keys: ['Esc'], desc: '入力から抜ける／note素材の選択モードを解除' },
      { keys: ['⌘', 'Enter'], desc: '（選択モード中）選択完了モーダルを開く' },
    ],
  },
  {
    // 247: ⌘Enter/⌘⇧Backspace を持つ画面。実行ボタンの data-kb-run が見えているかで判定する
    title: '生成・実行画面（🚀テキスト分析・🔭ディープリサーチ・✍️note記事生成）',
    scope: 'run',
    items: [
      {
        keys: ['⌘', 'Enter'],
        desc: '実行する（Windowsは Ctrl+Enter）',
        note: '入力欄にカーソルがあるままでも効きます',
      },
      {
        keys: ['⌘', '⇧', '⌫'],
        desc: '入力をクリア（Windowsは Ctrl+Shift+Backspace）',
        note: '直後に出る「↩ 元に戻す」で戻せます（note記事生成は実行キーのみ）',
      },
    ],
  },
  {
    title: '全体',
    scope: 'global',
    items: [
      { keys: ['?'], desc: 'このショートカット一覧を表示' },
      { keys: ['⌘', 'K'], desc: 'コマンドパレット（既存機能）' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// 247: 生成・実行画面の「実行」「クリア」キー（割り当てはここに一元管理）
//
// 割り当ての根拠:
// - 実行 = ⌘/Ctrl + Enter。「送信」の慣習キーで、入力欄にカーソルがあるまま押せる。
//   単独キーではないので isTypingTarget では止めない（入力中こそ押したいキー）。
// - クリア = ⌘/Ctrl + Shift + Backspace。⌘+Backspace 単独は macOS の
//   「行頭まで削除」＝テキスト入力の標準操作なので奪わない。Delete は見ない
//   （Windows Chrome の Ctrl+Shift+Delete＝閲覧履歴の削除と衝突するため）。
// - クリアは破壊的なので確認ダイアログではなく **Undo（↩ 元に戻す）** を画面側に置く。
//   確認を挟むと「キーで速く消す」という目的自体が消えるため（R-52）。
// ─────────────────────────────────────────────────────────────

// キー併記の表記（Mac / Windows）。ボタンラベル・一覧・ガイドが同じ値を見る
export const RUN_KEY_LABELS = {
  mac: { run: '⌘↵', clear: '⌘⇧⌫' },
  win: { run: 'Ctrl+↵', clear: 'Ctrl+Shift+⌫' },
} as const;

// Mac判定は一度だけ。navigator を触るのは「ヒントを出す」と決まった後だけ＝
// SSR/初期描画（useShortcutHints が false）では絶対に評価されない
let macCache: boolean | null = null;
function isMacPlatform(): boolean {
  if (macCache === null) {
    // navigator.platform は非推奨だが Mac 判定は userAgent より確実。両方を見る
    const ua = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
    macCache = /Mac|iPhone|iPad/i.test(ua);
  }
  return macCache;
}

/**
 * 実行ボタン等へ併記するキー表記を返す。
 * 表示条件は既存のヒントと同じ（デスクトップ＋ショートカット設定ON）。
 * 出さない場合は null（＝効かないキーを案内しない）。
 */
export function useRunKeyHints(): { run: string; clear: string } | null {
  const show = useShortcutHints();
  if (!show) return null;
  return isMacPlatform() ? RUN_KEY_LABELS.mac : RUN_KEY_LABELS.win;
}

export type RunShortcutOptions = {
  /** この画面（タブ）の外枠。display:none のタブでは発火させないための可視判定に使う */
  containerRef?: RefObject<HTMLElement | null>;
  /** 画面側の追加条件（モーダル表示中など）。false の間は発火しない。既定 true */
  active?: boolean;
  /** 実行できる状態か（未入力・実行中は false）。false なら何もしない＝無効ボタンと同じ挙動 */
  canRun?: boolean;
  onRun?: () => void;
  /** クリアできる状態か（空欄・実行中は false） */
  canClear?: boolean;
  onClear?: () => void;
};

/**
 * 生成・実行画面の共通ショートカット（⌘/Ctrl+Enter=実行 / ⌘/Ctrl+Shift+Backspace=クリア）。
 * 各画面にキーハンドラを散らさず、この1本だけを設置する。
 */
export function useRunShortcut(options: RunShortcutOptions) {
  // 最新の options をイベント時に読むための箱。描画中に書かず、毎描画後の effect で更新する
  const ref = useRef(options);
  useEffect(() => {
    ref.current = options;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const o = ref.current;
      if (o.active === false) return;
      if (!isShortcutsEnabled()) return;
      if (e.isComposing) return; // IME変換確定の Enter を実行にしない
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      // 全画面リーダー等のモーダル表示中（bodyスクロールロック中）は背面に効かせない
      if (document.body.style.overflow === 'hidden') return;
      // note素材の選択モード中は NoteBundleDock の ⌘Enter（選択完了）に譲る
      if (document.querySelector('[data-kb-select-mode]')) return;
      // タブ切替で display:none になっている画面には効かせない
      if (o.containerRef?.current && o.containerRef.current.offsetParent === null) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        if (!o.onRun || o.canRun === false) return;
        e.preventDefault();
        o.onRun();
        return;
      }
      if (e.key === 'Backspace' && e.shiftKey) {
        if (!o.onClear || o.canClear === false) return;
        e.preventDefault();
        o.onClear();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
