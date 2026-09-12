// 332【D】: 分析対象テキスト欄の高さを切り替える（S／M／L／自動）。
//
// ── なぜ必要か ────────────────────────────────────────────
// 院長の実測（iPhone・2026/9/12）:「分析対象テキスト欄の高さを変えられない」。
// 従来は `rows={8}` の固定＋`resize: vertical`。resize のドラッグは**iOSでは効かない**ため、
// スマホからは高さを変える手段が無かった。プリセットを主、ドラッグを従にする。
//
// ── 決め方（R-74: 決定的）──────────────────────────────
// 「約N行」は `rows` 属性で出す（ブラウザが行の高さから計算する＝文字サイズ設定にも追従する）。
// 「自動」だけは内容に合わせて伸ばすので px を計算するが、上限は画面の高さの 60%（AUTO_MAX_RATIO）。
// 乱数・現在時刻は使わない。保存は 313/320 と同じ localStorage（このブラウザ単位）。
//
// ── 操作行との関係（332【A】）─────────────────────────────
// 高さを変えても、操作行は**テキスト欄の直下**のまま（順序は DOM で固定＝高さの指定では動かない）。

/** 高さの選択肢。'auto' は内容に合わせて伸びる（上限あり） */
export type TextareaHeightChoice = 'S' | 'M' | 'L' | 'auto';

/** 表示順（ボタンの並び）。ここが唯一の正 */
export const TA_HEIGHT_CHOICES: TextareaHeightChoice[] = ['S', 'M', 'L', 'auto'];

/** 既定は M（約12行）。従来の rows=8 より少し広い＝「押し下げられる」不満の裏返し */
export const TA_HEIGHT_DEFAULT: TextareaHeightChoice = 'M';

/** 保存先（端末単位・313/320と同じ方式） */
export const TA_HEIGHT_KEY = 'lumina_ta_input_height';

/** S／M／L の行数。「約6行／約12行／約24行」の正 */
export const TA_HEIGHT_ROWS: Record<Exclude<TextareaHeightChoice, 'auto'>, number> = {
  S: 6,
  M: 12,
  L: 24,
};

/** 「自動」の上限＝画面の高さの 60%（これ以上は伸ばさずスクロールさせる） */
export const TA_AUTO_MAX_RATIO = 0.6;

/** ボタンのラベル（R-57: 12文字以内） */
export const TA_HEIGHT_LABEL: Record<TextareaHeightChoice, string> = {
  S: 'S',
  M: 'M',
  L: 'L',
  auto: '自動',
};

/** ボタンの説明（title＝300の即時ツールチップがそのまま使う） */
export const TA_HEIGHT_TITLE: Record<TextareaHeightChoice, string> = {
  S: '入力欄の高さ: 小（約6行）',
  M: '入力欄の高さ: 中（約12行・既定）',
  L: '入力欄の高さ: 大（約24行）',
  auto: '入力欄の高さ: 自動（内容に合わせて伸びる・画面の60%まで）',
};

/** 文字列が選択肢かどうか（保存値の検証に使う） */
export function isTextareaHeightChoice(v: unknown): v is TextareaHeightChoice {
  return v === 'S' || v === 'M' || v === 'L' || v === 'auto';
}

/** 保存値を読む。未設定・壊れた値・読めない環境（プライベートモード等）は既定に倒す */
export function loadTextareaHeight(
  key: string = TA_HEIGHT_KEY,
  fallback: TextareaHeightChoice = TA_HEIGHT_DEFAULT,
): TextareaHeightChoice {
  try {
    if (typeof window === 'undefined') return fallback;
    const v = window.localStorage.getItem(key);
    return isTextareaHeightChoice(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/** 保存する（失敗しても画面の挙動は変えない） */
export function saveTextareaHeight(
  choice: TextareaHeightChoice,
  key: string = TA_HEIGHT_KEY,
): void {
  try {
    window.localStorage.setItem(key, choice);
  } catch {
    /* 保存できない環境でも、そのセッション中の表示は切り替わる */
  }
}

/**
 * `textarea` に渡す指定。`rows` はブラウザに行数で計算させ、'auto' のときだけ
 * 呼び出し側が scrollHeight で高さを入れる（`rows` は最小行数として残す）。
 *
 * - S／M／L: `resize: 'vertical'`（PCはドラッグでも変えられる。iOSでは効かないのでプリセットが主）
 * - 自動: `resize: 'none'`（次の入力で上書きされるため、ドラッグを受け付ける形にしない）
 */
export function textareaHeightStyle(choice: TextareaHeightChoice): {
  rows: number;
  resize: 'vertical' | 'none';
  auto: boolean;
} {
  if (choice === 'auto') return { rows: TA_HEIGHT_ROWS.S, resize: 'none', auto: true };
  return { rows: TA_HEIGHT_ROWS[choice], resize: 'vertical', auto: false };
}

/** 「自動」のときの高さ(px)。内容の高さと上限（画面の60%）の小さい方 */
export function autoHeightPx(scrollHeight: number, viewportHeight: number): number {
  const max = Math.floor(viewportHeight * TA_AUTO_MAX_RATIO);
  return Math.max(0, Math.min(Math.ceil(scrollHeight), max));
}
