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

// ヘルプモーダル表示用の一覧（実装と同期して手で更新する）
export const SHORTCUT_SECTIONS: Array<{
  title: string;
  items: Array<{ keys: string[]; desc: string; note?: string }>;
}> = [
  {
    title: '全画面リーダー（⛶）',
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
    items: [
      { keys: ['/'], desc: '検索ボックスにフォーカス' },
      { keys: ['Esc'], desc: '入力から抜ける／note素材の選択モードを解除' },
      { keys: ['⌘', 'Enter'], desc: '（選択モード中）選択完了モーダルを開く' },
    ],
  },
  {
    title: '全体',
    items: [
      { keys: ['?'], desc: 'このショートカット一覧を表示' },
      { keys: ['⌘', 'K'], desc: 'コマンドパレット（既存機能）' },
    ],
  },
];
