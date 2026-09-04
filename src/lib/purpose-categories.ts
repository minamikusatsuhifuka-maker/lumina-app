// 297: 🎯用途カテゴリ（note用／Kindle用／保留 など、院長が「用途」で付ける分類）のデータ層。
//
// 既存の3分類とは別体系:
//   ⭐マイフォルダ（custom_folders・テーマ・お気に入り前提）／AIカテゴリ（自動・1件1つ）／タグ（メタ情報）
// マイフォルダの実装（lib/custom-folders.ts）には触れず、**別テーブル**で持つ（§4・§6）。
// マイフォルダの表に相乗りしない理由: 同じ表を使うと「未分類のお気に入り」の判定や置き換え式の
// 所属更新（setItemFolders＝item_key の行を全消し→入れ直し）が用途の所属まで巻き込み、
// マイフォルダの挙動が変わってしまう。
//
// 設計（§4-2）:
//   purpose_categories       … 体系は1つ（3画面で共有）。user_id ごとに名前は一意
//   purpose_category_items   … 中間テーブル（カテゴリ ⇄ 記事）。scope=記事の種別
//                              （'text_analysis' | 'library' | 'context'）、item_key=id::text
//                              （library の id は uuid のため text に統一・252と同じ）
//   - 記事は複数のカテゴリに同時に入れる（UNIQUE (category_id, scope, item_key)）
//   - カテゴリ削除は ON DELETE CASCADE で所属だけ外れ、記事は消えない
//   - 記事削除時は detachItemFromPurposes / detachItemsFromPurposes で所属を外す（孤児掃除）。
//     万一残っても件数は実テーブルと JOIN して数えるので害はない
//
// スキーマは ensurePurposeTables() の冪等DDL（CREATE TABLE/INDEX IF NOT EXISTS のみ＝停止条件①の例外）。

import { sql } from '@/lib/db';
import { sanitizeForDb } from '@/lib/sanitize';
import { ITEM_SCOPES, isItemScope, type ItemScope } from '@/lib/custom-folders';

export { ITEM_SCOPES, isItemScope };
export type { ItemScope };

/** カテゴリ名の上限（バッジ表示が破綻しない長さ・マイフォルダと同じ） */
export const MAX_PURPOSE_NAME_LENGTH = 30;
/** カテゴリ数の上限（一覧性を失わない範囲） */
export const MAX_PURPOSES = 50;

export interface PurposeCategory {
  id: number;
  name: string;
  sort_order: number;
  /** いま見ている画面の記事種別での件数（実体が消えたものは数えない） */
  count: number;
  /** 3画面合計の件数 */
  count_total: number;
}

// ============================================================
// スキーマ（冪等DDL・プロセス内で1回だけ）
// ============================================================

let tablesReady: Promise<unknown> | null = null;

export function ensurePurposeTables(): Promise<unknown> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS purpose_categories (
        id         serial PRIMARY KEY,
        user_id    text NOT NULL,
        name       text NOT NULL,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_purpose_categories_uniq
        ON purpose_categories (user_id, name)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_purpose_categories_list
        ON purpose_categories (user_id, sort_order, id)`;
      await sql`CREATE TABLE IF NOT EXISTS purpose_category_items (
        category_id int NOT NULL REFERENCES purpose_categories(id) ON DELETE CASCADE,
        user_id     text NOT NULL,
        scope       text NOT NULL,
        item_key    text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_purpose_category_items_uniq
        ON purpose_category_items (category_id, scope, item_key)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_purpose_category_items_key
        ON purpose_category_items (user_id, scope, item_key)`;
    })().catch((e) => {
      tablesReady = null;
      throw e;
    });
  }
  return tablesReady;
}

// ============================================================
// 読み取り
// ============================================================

/** 表示中の記事IDに対する所属用途カテゴリIDを一括で引く（本体クエリと別・失敗は呼び出し側が握る） */
export async function getPurposeIdsForItems(
  userId: string,
  scope: ItemScope,
  itemIds: (number | string)[],
): Promise<Record<string, number[]>> {
  const keys = itemIds.map((v) => String(v)).filter(Boolean);
  if (keys.length === 0) return {};
  const rows = (await sql`
    SELECT item_key, category_id
    FROM purpose_category_items
    WHERE user_id = ${userId} AND scope = ${scope} AND item_key = ANY(${keys})
    ORDER BY category_id
  `) as { item_key: string; category_id: number }[];
  const map: Record<string, number[]> = {};
  for (const r of rows) (map[r.item_key] ??= []).push(r.category_id);
  return map;
}

/**
 * 用途カテゴリ一覧（並び順つき）＋件数。
 * count は「いま見ている画面の種別」の件数、count_total は3画面の合計。
 * どちらも実テーブルと JOIN して数える＝記事が消えた分（孤児）は数えない（決定的・R-74）。
 */
export async function listPurposesWithCounts(
  userId: string,
  scope: ItemScope,
): Promise<PurposeCategory[]> {
  const rows = (await sql`
    SELECT c.id, c.name, c.sort_order,
           (SELECT COUNT(*)::int FROM purpose_category_items i
              JOIN text_analysis_saves s ON s.id::text = i.item_key AND s.user_id = c.user_id
             WHERE i.category_id = c.id AND i.scope = 'text_analysis') AS n_text_analysis,
           (SELECT COUNT(*)::int FROM purpose_category_items i
              JOIN library l ON l.id::text = i.item_key AND l.user_id = c.user_id
             WHERE i.category_id = c.id AND i.scope = 'library') AS n_library,
           (SELECT COUNT(*)::int FROM purpose_category_items i
              JOIN context_saves x ON x.id::text = i.item_key AND x.user_id = c.user_id
             WHERE i.category_id = c.id AND i.scope = 'context') AS n_context
    FROM purpose_categories c
    WHERE c.user_id = ${userId}
    ORDER BY c.sort_order ASC, c.id ASC
  `) as { id: number; name: string; sort_order: number; n_text_analysis: number; n_library: number; n_context: number }[];
  return rows.map((r) => {
    const n = { text_analysis: Number(r.n_text_analysis ?? 0), library: Number(r.n_library ?? 0), context: Number(r.n_context ?? 0) };
    return {
      id: Number(r.id),
      name: String(r.name),
      sort_order: Number(r.sort_order),
      count: n[scope],
      count_total: n.text_analysis + n.library + n.context,
    };
  });
}

// ============================================================
// 書き込み
// ============================================================

/** カテゴリ名の正規化（前後空白除去・NUL/孤立サロゲート除去・長さ上限）。空なら null */
export function normalizePurposeName(raw: unknown): string | null {
  const s = sanitizeForDb(raw).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  return s.slice(0, MAX_PURPOSE_NAME_LENGTH);
}

/** PostgreSQL の一意制約違反（同名）か */
export function isPurposeUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === '23505';
}

/**
 * 記事の所属用途カテゴリを categoryIds の内容にそろえる（置き換え式・マイフォルダと同じ流儀）。
 * 他人のカテゴリIDは INSERT ... SELECT ... WHERE EXISTS で黙って弾く。削除と追加は1トランザクション。
 */
export async function setItemPurposes(
  userId: string,
  scope: ItemScope,
  itemKey: string,
  categoryIds: number[],
): Promise<void> {
  const unique = Array.from(new Set(categoryIds.map((n) => Number(n)).filter((n) => Number.isFinite(n))));
  await sql.transaction([
    sql`DELETE FROM purpose_category_items
        WHERE user_id = ${userId} AND scope = ${scope} AND item_key = ${itemKey}`,
    ...unique.map(
      (cid) => sql`
        INSERT INTO purpose_category_items (category_id, user_id, scope, item_key)
        SELECT ${cid}, ${userId}, ${scope}, ${itemKey}
        WHERE EXISTS (SELECT 1 FROM purpose_categories WHERE id = ${cid} AND user_id = ${userId})
        ON CONFLICT DO NOTHING
      `,
    ),
  ]);
}

/** 記事が削除されたときに所属を外す（孤児掃除。呼び出し側は失敗を握ってよい） */
export async function detachItemFromPurposes(userId: string, scope: ItemScope, itemKey: string | number): Promise<void> {
  await sql`DELETE FROM purpose_category_items
    WHERE user_id = ${userId} AND scope = ${scope} AND item_key = ${String(itemKey)}`;
}

/** 一括削除した記事の所属をまとめて外す */
export async function detachItemsFromPurposes(userId: string, scope: ItemScope, itemKeys: (string | number)[]): Promise<void> {
  const keys = itemKeys.map((v) => String(v)).filter(Boolean);
  if (keys.length === 0) return;
  await sql`DELETE FROM purpose_category_items
    WHERE user_id = ${userId} AND scope = ${scope} AND item_key = ANY(${keys})`;
}

/**
 * 削除確認に出す「そのカテゴリに入っている件数」（3画面合計）。削除自体はしない（R-76: 取得成功後に破壊的操作）。
 */
export function purposeDeleteConfirmMessage(name: string, countTotal: number): string {
  return (
    `用途カテゴリ「${name}」を削除します。\n\n` +
    `このカテゴリには ${countTotal}件 の記事が入っていますが、記事は削除されません（用途の割り当てが外れるだけです）。\n` +
    `よろしいですか？`
  );
}
