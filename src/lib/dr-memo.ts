// 208（案A）: 追従「🗒 カテゴリメモ」の純ロジック。
//
// 保存先は AIメモ（112〜127）の memos / memo_categories をそのまま使う（同目的テーブルを増やさない・R-49）。
// ここに置くのは、画面（DrMemoPanel）とE2E（U60）が同じ判断を使うための小さな関数だけ。
// 判断は決定的（R-74）。DB・fetch・DOM には触れない。

/** 一覧は必ずページング（全件走査の「静かな打ち切り」を踏まない）。1ページの件数 */
export const DR_MEMO_PAGE_SIZE = 30;
/** context_ref（メモ時に開いていたお題）の上限文字数。長いお題は先頭だけ残す */
export const DR_MEMO_CONTEXT_MAX = 200;
/** 最後に選んだカテゴリを次回も使う（localStorage） */
export const DR_MEMO_CATEGORY_KEY = 'lumina_drmemo_category';
/** 「未分類」（category_id IS NULL）を表す選択値。カテゴリIDは uuid なので衝突しない */
export const DR_MEMO_UNCATEGORIZED = 'none';
export const DR_MEMO_UNCATEGORIZED_LABEL = '未分類';

/** カテゴリの色（バッジの点に使う。文字を載せないのでコントラスト比の制約はない） */
export const DR_MEMO_CATEGORY_COLORS = ['#6c63ff', '#0d9973', '#B45309', '#dc2626', '#2563eb', '#7c3aed'] as const;

/** API に渡す context_ref を正規化する（空白畳み・上限・空は null） */
export function normalizeContextRef(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > DR_MEMO_CONTEXT_MAX ? t.slice(0, DR_MEMO_CONTEXT_MAX) : t;
}

/** 保存トースト。カテゴリ名を必ず出す（どこに入ったかが分かる） */
export function drMemoToastMessage(categoryName: string | null | undefined): string {
  return `🗒 「${(categoryName ?? '').trim() || DR_MEMO_UNCATEGORIZED_LABEL}」に保存しました`;
}

/** 選択値 → API の category_id（未分類は null） */
export function categoryIdOf(choice: string): string | null {
  return choice === DR_MEMO_UNCATEGORIZED ? null : choice;
}

/** 一覧取得のクエリ（ページング必須・未分類は uncategorized=1 で category_id IS NULL を引く） */
export function memoListQuery(choice: string, offset = 0, limit = DR_MEMO_PAGE_SIZE): string {
  const p = new URLSearchParams();
  p.set('limit', String(limit));
  if (offset > 0) p.set('offset', String(offset));
  if (choice === DR_MEMO_UNCATEGORIZED) p.set('uncategorized', '1');
  else p.set('category_id', choice);
  return p.toString();
}

/** 保存済みの選択値を読む。無効値・未設定は未分類 */
export function resolveCategoryChoice(saved: string | null | undefined, categoryIds: readonly string[]): string {
  if (saved && categoryIds.includes(saved)) return saved;
  return DR_MEMO_UNCATEGORIZED;
}

/** 並び替え（▲▼）: 隣と入れ替えた新しい配列を返す。端では変えない。入力は変更しない */
export function moveItem<T>(list: readonly T[], index: number, dir: -1 | 1): T[] {
  const next = [...list];
  const j = index + dir;
  if (index < 0 || index >= next.length || j < 0 || j >= next.length) return next;
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** 並び替え後、sort_order を書き換える必要がある項目だけを返す（変わらない項目に PATCH を打たない） */
export function sortOrderPatches<T extends { id: string; sort_order: number }>(ordered: readonly T[]): { id: string; sort_order: number }[] {
  return ordered
    .map((c, i) => ({ id: c.id, sort_order: i, prev: c.sort_order }))
    .filter((c) => c.prev !== c.sort_order)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}
