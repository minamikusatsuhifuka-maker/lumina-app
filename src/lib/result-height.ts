// 334: 成果物（🗂テキスト分析の生成結果カード・🗂保存一覧の展開ビュー）の本文の高さ。
//
// ── なぜ1箇所に集めるのか（R-91）────────────────────────────
// 同じ「高さ S/M/L/全」が TextAnalysisPanel と SavedAnalysisList に**別々に**書かれていて、
// 片方だけ既定がSだった（TextAnalysisPanel は `useState(350)` ＝S・記憶なし／
// SavedAnalysisList は既定M・localStorage 記憶あり）。院長の指摘「既定はM」「Sは使わない」を
// 両方に確実に効かせるため、値・既定・記憶・読み替えをここに集める。
//
// ── S の廃止（334 §2-2）──────────────────────────────────
// 院長の実測（2026/9/13）: Sは使わない。プリセットは **M（既定）／L／⛶ 全画面** の3つ。
// すでに 'S' を記憶している端末は**起動時にMへ読み替え、その場で保存値も書き換える**
// （読むたびに読み替える形にすると、記憶が 'S' のまま残り続けて次の便で判断を誤るため）。
// 330 で「全」はカードを伸ばさず全画面リーダーで開く形に振り替えたので、'full' も記憶しない。

/** 枠の高さとして記憶するモード。「全」は全画面リーダーを開く操作であって高さではない（330） */
export type ResultHeightMode = 'M' | 'L';

/** 画面に出す並び。'full' は高さではなく全画面リーダーを開くボタン */
export type ResultHeightButton = ResultHeightMode | 'full';
export const RESULT_HEIGHT_BUTTONS: ResultHeightButton[] = ['M', 'L', 'full'];

/** 枠の高さ(px)。Sは廃止（334） */
export const RESULT_HEIGHT_VALUES: Record<ResultHeightMode, number> = {
  M: 550,
  L: 800,
};

/** 記憶が無いときの既定（334 §2-3・現行どおり） */
export const RESULT_HEIGHT_DEFAULT: ResultHeightMode = 'M';

/** 記憶のキー。🗂保存一覧が以前から使っているキーをそのまま使う＝院長の端末の記憶を引き継ぐ */
export const RESULT_HEIGHT_KEY = 'ta_saved_height';

/**
 * 保存値をモードに直す。壊れていても既定に倒す（fail-closed）。
 * - `'S'`（334で廃止）→ M
 * - `'full'`（330でカードを伸ばさなくなった）→ M
 */
export function normalizeResultHeight(raw: string | null | undefined): ResultHeightMode {
  return raw === 'M' || raw === 'L' ? raw : RESULT_HEIGHT_DEFAULT;
}

/** 読み替えが起きたか（保存値を書き換えるべきか）。'S' や 'full' や壊れた値のとき true */
export function needsResultHeightMigration(raw: string | null | undefined): boolean {
  return raw !== null && raw !== undefined && raw !== normalizeResultHeight(raw);
}

/**
 * 端末の記憶を読む。'S' 等が入っていたら **その場で保存値もMに書き換える**（334 §2-2 のマイグレーション）。
 * localStorage が使えない環境（プライベートブラウズ等）では既定を返す。
 */
export function loadResultHeight(): ResultHeightMode {
  try {
    const raw = localStorage.getItem(RESULT_HEIGHT_KEY);
    const mode = normalizeResultHeight(raw);
    if (needsResultHeightMigration(raw)) localStorage.setItem(RESULT_HEIGHT_KEY, mode);
    return mode;
  } catch {
    return RESULT_HEIGHT_DEFAULT;
  }
}

export function saveResultHeight(mode: ResultHeightMode): void {
  try {
    localStorage.setItem(RESULT_HEIGHT_KEY, mode);
  } catch {
    /* 保存できない環境では記憶しない（表示は動く） */
  }
}

/** ボタンの説明（R-110: 省略しないで読める文） */
export function resultHeightTitle(b: ResultHeightButton): string {
  if (b === 'full') return '全文を全画面で読みます（カードは伸ばしません）';
  return `本文の表示枠を${b}サイズにします`;
}

/** ボタンの表示文字（R-57: 12文字以内） */
export function resultHeightLabel(b: ResultHeightButton): string {
  return b === 'full' ? '⛶ 全画面' : b;
}
