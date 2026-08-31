// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 277 §2-2: バッチリサーチのジョブ名を**決定的に**導出する（R-74）。
//
// AIによる命名はしない——トピック名がすでに十分説明的で、即時に決まり、
// 何度作っても同じ名前になる方が履歴として役に立つ（生成待ちも課金も発生しない）。
//
// 決定順:
//   1. グループ名（入力があればそのまま）
//   2. トピック名の連結（1件＝そのまま／2件以上＝「〈先頭〉 他n件」）
// **タイムスタンプだけの名前は作らない**（UTC/JSTの取り違えで9時間ずれた名前が残る原因だった）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 先頭トピックをこの長さで切る（履歴の1行に収まる範囲） */
export const BATCH_TITLE_TOPIC_MAX = 40;
/** グループ名の上限（入力欄は自由だが、履歴の表示が破綻しない長さに切る） */
export const BATCH_TITLE_GROUP_MAX = 80;
/** トピックもグループ名も無いとき（通常は起こらない）の最終手段 */
export const BATCH_TITLE_FALLBACK = 'バッチリサーチ';

function squash(text: unknown): string {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

/** 長い文字列を末尾「…」で切る（切る必要がなければそのまま返す） */
export function truncateTitle(text: string, max: number): string {
  const s = squash(text);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * ジョブ名を決める。副作用も時刻参照も持たない純関数（同じ入力なら必ず同じ名前）。
 * topics は文字列でも { topic } でも受ける（呼び出し側の形に合わせる）。
 */
export function deriveBatchJobTitle(
  groupName: unknown,
  topics: readonly (string | { topic?: unknown })[] = [],
): string {
  const group = squash(groupName);
  if (group) return truncateTitle(group, BATCH_TITLE_GROUP_MAX);

  const names = topics
    .map((t) => squash(typeof t === 'string' ? t : t?.topic))
    .filter((t) => t.length > 0);
  if (names.length === 0) return BATCH_TITLE_FALLBACK;

  const head = truncateTitle(names[0], BATCH_TITLE_TOPIC_MAX);
  return names.length === 1 ? head : `${head} 他${names.length - 1}件`;
}
