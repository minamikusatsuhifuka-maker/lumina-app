// 249: お気に入りのカスタムフォルダ分類（院長が名前を付けるフォルダ）のデータ層。
//
// 既存の「🤖AIが自動カテゴライズ」（text_analysis_saves.folder / context_saves.category）とは
// **別軸**。自動カテゴリは1件1つ・AIが決めるのに対し、こちらは1件に複数所属できるタグ式で、
// 名前も並び順も院長が決める。両者は互いに影響しない（自動カテゴリ側は一切触らない）。
//
// 保存一覧（テキスト分析）と AI参照素材 でフォルダ体系を分けるため、すべての行に scope を持たせる。
// scope が違えば同じ名前のフォルダを作れるし、一覧・件数・絞り込みも混ざらない。
//
// スキーマは ensureCustomFolderTables() の冪等DDL（R-10・手動SQLを前提にしない）。

import { sql } from '@/lib/db';
import { sanitizeForDb } from '@/lib/sanitize';

// ============================================================
// スコープ（フォルダ体系の分離キー）
// ============================================================

/** 📁保存一覧（text_analysis_saves） / 🧠AI参照素材（context_saves） */
export type FolderScope = 'text_analysis' | 'context';

export const FOLDER_SCOPES: readonly FolderScope[] = ['text_analysis', 'context'] as const;

export function isFolderScope(v: unknown): v is FolderScope {
  return v === 'text_analysis' || v === 'context';
}

/** フォルダ名の上限（バッジ表示が破綻しない長さ） */
export const MAX_FOLDER_NAME_LENGTH = 30;
/** 1スコープあたりのフォルダ数上限（フォルダ一覧が一覧性を失わない範囲） */
export const MAX_FOLDERS_PER_SCOPE = 50;

export interface CustomFolder {
  id: number;
  name: string;
  sort_order: number;
  /** そのフォルダに入っている記事の件数（実体が消えたものは数えない） */
  count: number;
}

// ============================================================
// スキーマ（冪等DDL・プロセス内で1回だけ）
// ============================================================

let tablesReady: Promise<unknown> | null = null;

export function ensureCustomFolderTables(): Promise<unknown> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS custom_folders (
        id         serial PRIMARY KEY,
        user_id    text NOT NULL,
        scope      text NOT NULL,
        name       text NOT NULL,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      // 同一スコープ内で同名フォルダを作らせない（作成・リネームの重複検出をDBで保証）
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_folders_uniq
        ON custom_folders (user_id, scope, name)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_custom_folders_list
        ON custom_folders (user_id, scope, sort_order, id)`;

      await sql`CREATE TABLE IF NOT EXISTS custom_folder_items (
        folder_id  int NOT NULL REFERENCES custom_folders(id) ON DELETE CASCADE,
        user_id    text NOT NULL,
        scope      text NOT NULL,
        item_id    int NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (folder_id, item_id)
      )`;
      // 一覧30件のフォルダ逆引き・絞り込みのEXISTS・未分類判定がすべてこのindexで引ける
      await sql`CREATE INDEX IF NOT EXISTS idx_custom_folder_items_lookup
        ON custom_folder_items (user_id, scope, item_id)`;
    })().catch((e) => {
      // 失敗時は次回再試行できるようリセット（既存の ensure* と同じ流儀）
      tablesReady = null;
      throw e;
    });
  }
  return tablesReady;
}

// ============================================================
// 読み取り
// ============================================================

/**
 * 表示中の記事IDに対する所属フォルダIDを一括で引く（一覧30件想定）。
 *
 * 一覧の本体クエリには手を入れず、別クエリで付与する。フォルダ機能が落ちても
 * 記事一覧そのものは出る（付加情報の失敗で本体を壊さない・R-39）ため、
 * 呼び出し側は失敗を握って空マップで続行してよい。
 */
export async function getFolderIdsForItems(
  userId: string,
  scope: FolderScope,
  itemIds: number[],
): Promise<Record<number, number[]>> {
  const ids = itemIds.filter((n) => Number.isFinite(n));
  if (ids.length === 0) return {};
  const rows = (await sql`
    SELECT item_id, folder_id
    FROM custom_folder_items
    WHERE user_id = ${userId} AND scope = ${scope} AND item_id = ANY(${ids})
    ORDER BY folder_id
  `) as { item_id: number; folder_id: number }[];
  const map: Record<number, number[]> = {};
  for (const r of rows) {
    (map[r.item_id] ??= []).push(r.folder_id);
  }
  return map;
}

/**
 * フォルダ一覧（並び順つき）＋各フォルダの件数。
 *
 * 件数は実テーブルとJOINして数える＝記事が消えた分（孤児）は最初から数えない。
 * 記事削除時にも custom_folder_items を消しているが、取りこぼしがあっても件数は正しくなる。
 */
export async function listFoldersWithCounts(
  userId: string,
  scope: FolderScope,
): Promise<CustomFolder[]> {
  const rows =
    scope === 'text_analysis'
      ? await sql`
          SELECT f.id, f.name, f.sort_order,
                 (SELECT COUNT(*)::int
                    FROM custom_folder_items i
                    JOIN text_analysis_saves s ON s.id = i.item_id AND s.user_id = f.user_id
                   WHERE i.folder_id = f.id) AS count
          FROM custom_folders f
          WHERE f.user_id = ${userId} AND f.scope = ${scope}
          ORDER BY f.sort_order ASC, f.id ASC
        `
      : await sql`
          SELECT f.id, f.name, f.sort_order,
                 (SELECT COUNT(*)::int
                    FROM custom_folder_items i
                    JOIN context_saves s ON s.id = i.item_id AND s.user_id = f.user_id
                   WHERE i.folder_id = f.id) AS count
          FROM custom_folders f
          WHERE f.user_id = ${userId} AND f.scope = ${scope}
          ORDER BY f.sort_order ASC, f.id ASC
        `;
  return (rows as CustomFolder[]).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    sort_order: Number(r.sort_order),
    count: Number(r.count ?? 0),
  }));
}

/**
 * 「お気に入り総数」と「お気に入りだがどのフォルダにも入っていない件数（＝未分類）」。
 * フォルダ一覧の先頭カードに出す。
 */
export async function getFavoriteSummary(
  userId: string,
  scope: FolderScope,
): Promise<{ favorite_total: number; unfiled_favorite_count: number }> {
  const rows =
    scope === 'text_analysis'
      ? await sql`
          SELECT
            COUNT(*) FILTER (WHERE s.favorite)::int AS favorite_total,
            COUNT(*) FILTER (
              WHERE s.favorite AND NOT EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_id = s.id AND i.user_id = s.user_id AND i.scope = ${scope}
              )
            )::int AS unfiled_favorite_count
          FROM text_analysis_saves s
          WHERE s.user_id = ${userId}
        `
      : await sql`
          SELECT
            COUNT(*) FILTER (WHERE s.is_favorite)::int AS favorite_total,
            COUNT(*) FILTER (
              WHERE s.is_favorite AND NOT EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_id = s.id AND i.user_id = s.user_id AND i.scope = ${scope}
              )
            )::int AS unfiled_favorite_count
          FROM context_saves s
          WHERE s.user_id = ${userId}
        `;
  const r = (rows as { favorite_total: number; unfiled_favorite_count: number }[])[0];
  return {
    favorite_total: Number(r?.favorite_total ?? 0),
    unfiled_favorite_count: Number(r?.unfiled_favorite_count ?? 0),
  };
}

// ============================================================
// 書き込み
// ============================================================

/** フォルダ名の正規化（前後空白除去・NUL/孤立サロゲート除去・長さ上限）。空なら null。 */
export function normalizeFolderName(raw: unknown): string | null {
  const s = sanitizeForDb(raw).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  return s.slice(0, MAX_FOLDER_NAME_LENGTH);
}

/** PostgreSQL の一意制約違反（同名フォルダ）か */
export function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === '23505';
}

/**
 * 記事の所属フォルダを folderIds の内容にそろえる（置き換え式）。
 *
 * 他人のフォルダIDを渡されても入らないよう、INSERT は自分の同scopeフォルダが
 * 実在するときだけ行を作る（INSERT ... SELECT ... WHERE EXISTS）。
 * 削除と追加は部分適用が起きないよう1トランザクションにまとめる（R-07）。
 */
export async function setItemFolders(
  userId: string,
  scope: FolderScope,
  itemId: number,
  folderIds: number[],
): Promise<void> {
  const unique = Array.from(
    new Set(folderIds.map((n) => Number(n)).filter((n) => Number.isFinite(n))),
  );
  await sql.transaction([
    sql`DELETE FROM custom_folder_items
        WHERE user_id = ${userId} AND scope = ${scope} AND item_id = ${itemId}`,
    ...unique.map(
      (fid) => sql`
        INSERT INTO custom_folder_items (folder_id, user_id, scope, item_id)
        SELECT ${fid}, ${userId}, ${scope}, ${itemId}
        WHERE EXISTS (
          SELECT 1 FROM custom_folders
           WHERE id = ${fid} AND user_id = ${userId} AND scope = ${scope}
        )
        ON CONFLICT DO NOTHING
      `,
    ),
  ]);
}

/**
 * 記事が削除されたときに分類も外す（孤児掃除）。
 * 記事削除の本体を失敗させないよう、呼び出し側は失敗を握りつぶしてよい。
 */
export async function detachItemFromFolders(
  userId: string,
  scope: FolderScope,
  itemId: number,
): Promise<void> {
  await sql`DELETE FROM custom_folder_items
    WHERE user_id = ${userId} AND scope = ${scope} AND item_id = ${itemId}`;
}
