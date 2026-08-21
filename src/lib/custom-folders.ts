// 249/252: お気に入りのカスタムフォルダ分類（院長が名前を付けるフォルダ）のデータ層。
//
// 既存の「🤖AIが自動カテゴライズ」（text_analysis_saves.folder / context_saves.category /
// library.folder_name）とは**別軸**。自動カテゴリは1件1つ・AIが決めるのに対し、こちらは
// 1件に複数所属できるタグ式で、名前も並び順も院長が決める。両者は互いに影響しない。
//
// ── 252: 「アイテムの種類」と「フォルダ体系」を分けた ──────────────────────
// 院長の指示で 🗂保存一覧（text_analysis_saves）と 📚リサーチ保存（library）は
// **同じフォルダ一覧を共有**する（「本の素材」に分析結果もDR結果も混在して入れられる）。
// 🧠AI参照素材（context_saves）は独立した体系のまま。これを2つの軸で表す:
//
//   ItemScope   … アイテムがどのテーブルの行か（custom_folder_items.scope）
//                 'text_analysis' | 'library' | 'context'
//   FolderSystem … どのフォルダ一覧に属するか（custom_folders.scope）
//                 'stock'（保存一覧＋リサーチ保存の共有）| 'context'（AI参照素材の独立）
//
// 新テーブルは足さず、既存 scope 列の意味を「アイテム種別」に据えたまま値を1つ増やし、
// フォルダ側の scope だけを体系名（'stock'）へ移行した。将来「3画面すべて共有」にしたく
// なったら FOLDER_SYSTEM_OF のマッピング1行を変えるだけで済む。
//
// library.id は uuid(text)、他は integer なので、所属は item_key TEXT に統一して持つ。
// 旧 item_id(integer) は残すが参照しない（レガシー列・NULL許容へ落とす）。
//
// スキーマは ensureCustomFolderTables() の冪等DDL（R-10・手動SQLを前提にしない）。

import { sql } from '@/lib/db';
import { sanitizeForDb } from '@/lib/sanitize';

// ============================================================
// スコープ（アイテム種別）とフォルダ体系
// ============================================================

/** アイテムがどのテーブルの行か。APIの `scope` パラメータもこの値で受ける */
export type ItemScope = 'text_analysis' | 'library' | 'context';

/** どのフォルダ一覧に属するか（フォルダの所属体系） */
export type FolderSystem = 'stock' | 'context';

export const ITEM_SCOPES: readonly ItemScope[] = ['text_analysis', 'library', 'context'] as const;

/**
 * アイテム種別 → フォルダ体系の対応。
 * **ここが「どの画面どうしがフォルダを共有するか」の唯一の定義**。
 */
export const FOLDER_SYSTEM_OF: Record<ItemScope, FolderSystem> = {
  text_analysis: 'stock',
  library: 'stock',
  context: 'context',
};

export function isItemScope(v: unknown): v is ItemScope {
  return v === 'text_analysis' || v === 'library' || v === 'context';
}

export function folderSystemOf(scope: ItemScope): FolderSystem {
  return FOLDER_SYSTEM_OF[scope];
}

/** その体系にぶら下がるアイテム種別（件数の集計対象を決めるのに使う） */
export function itemScopesOf(system: FolderSystem): ItemScope[] {
  return ITEM_SCOPES.filter((s) => FOLDER_SYSTEM_OF[s] === system);
}

/** フォルダ名の上限（バッジ表示が破綻しない長さ） */
export const MAX_FOLDER_NAME_LENGTH = 30;
/** 1体系あたりのフォルダ数上限（フォルダ一覧が一覧性を失わない範囲） */
export const MAX_FOLDERS_PER_SCOPE = 50;

export interface CustomFolder {
  id: number;
  name: string;
  sort_order: number;
  /** その体系に属する記事の総数（実体が消えたものは数えない） */
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
      // 同一体系内で同名フォルダを作らせない（作成・リネームの重複検出をDBで保証）
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_folders_uniq
        ON custom_folders (user_id, scope, name)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_custom_folders_list
        ON custom_folders (user_id, scope, sort_order, id)`;

      await sql`CREATE TABLE IF NOT EXISTS custom_folder_items (
        folder_id  int NOT NULL REFERENCES custom_folders(id) ON DELETE CASCADE,
        user_id    text NOT NULL,
        scope      text NOT NULL,
        item_id    int,
        item_key   text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;

      // ── 252の移行（冪等）──────────────────────────────
      // 249時点のテーブルには item_key が無く、item_id(int) が主キーの一部だった。
      // library の id は uuid(text) なので int には入らない。所属は item_key に統一する。
      await sql`ALTER TABLE custom_folder_items ADD COLUMN IF NOT EXISTS item_key text`;
      await sql`UPDATE custom_folder_items
        SET item_key = item_id::text
        WHERE item_key IS NULL AND item_id IS NOT NULL`;
      // 旧PK (folder_id, item_id) は item_id を必須にしてしまうため外し、
      // 同じ役割の一意制約を (folder_id, scope, item_key) で張り直す
      await sql`ALTER TABLE custom_folder_items DROP CONSTRAINT IF EXISTS custom_folder_items_pkey`;
      await sql`ALTER TABLE custom_folder_items ALTER COLUMN item_id DROP NOT NULL`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_folder_items_uniq
        ON custom_folder_items (folder_id, scope, item_key)`;
      // 一覧のフォルダ逆引き・絞り込みのEXISTS・未分類判定がこのindexで引ける
      await sql`CREATE INDEX IF NOT EXISTS idx_custom_folder_items_key
        ON custom_folder_items (user_id, scope, item_key)`;

      // フォルダ側の scope は「体系名」に移行する。249で作られた 'text_analysis' の
      // フォルダは、保存一覧とリサーチ保存が共有する 'stock' 体系へそのまま引き継ぐ
      // （所属アイテム側の scope は種別なので触らない）。
      await sql`UPDATE custom_folders SET scope = 'stock' WHERE scope = 'text_analysis'`;
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
 * 表示中の記事IDに対する所属フォルダIDを一括で引く。
 *
 * 一覧の本体クエリには手を入れず、別クエリで付与する。フォルダ機能が落ちても
 * 記事一覧そのものは出る（付加情報の失敗で本体を壊さない・R-39）ため、
 * 呼び出し側は失敗を握って空マップで続行してよい。
 */
export async function getFolderIdsForItems(
  userId: string,
  scope: ItemScope,
  itemIds: (number | string)[],
): Promise<Record<string, number[]>> {
  const keys = itemIds.map((v) => String(v)).filter(Boolean);
  if (keys.length === 0) return {};
  const rows = (await sql`
    SELECT item_key, folder_id
    FROM custom_folder_items
    WHERE user_id = ${userId} AND scope = ${scope} AND item_key = ANY(${keys})
    ORDER BY folder_id
  `) as { item_key: string; folder_id: number }[];
  const map: Record<string, number[]> = {};
  for (const r of rows) {
    (map[r.item_key] ??= []).push(r.folder_id);
  }
  return map;
}

/**
 * フォルダ一覧（並び順つき）＋各フォルダの件数。
 *
 * 件数は実テーブルとJOINして数える＝記事が消えた分（孤児）は最初から数えない。
 * 'stock' 体系のフォルダは保存一覧とリサーチ保存の**合算**を返す
 * （1つのフォルダに両方の記事が混在して入るため）。
 */
export async function listFoldersWithCounts(
  userId: string,
  scope: ItemScope,
): Promise<CustomFolder[]> {
  const system = folderSystemOf(scope);
  const rows =
    system === 'stock'
      ? await sql`
          SELECT f.id, f.name, f.sort_order,
                 (
                   (SELECT COUNT(*)::int
                      FROM custom_folder_items i
                      JOIN text_analysis_saves s ON s.id::text = i.item_key AND s.user_id = f.user_id
                     WHERE i.folder_id = f.id AND i.scope = 'text_analysis')
                   +
                   (SELECT COUNT(*)::int
                      FROM custom_folder_items i
                      JOIN library l ON l.id::text = i.item_key AND l.user_id = f.user_id
                     WHERE i.folder_id = f.id AND i.scope = 'library')
                 ) AS count
          FROM custom_folders f
          WHERE f.user_id = ${userId} AND f.scope = ${system}
          ORDER BY f.sort_order ASC, f.id ASC
        `
      : await sql`
          SELECT f.id, f.name, f.sort_order,
                 (SELECT COUNT(*)::int
                    FROM custom_folder_items i
                    JOIN context_saves s ON s.id::text = i.item_key AND s.user_id = f.user_id
                   WHERE i.folder_id = f.id AND i.scope = 'context') AS count
          FROM custom_folders f
          WHERE f.user_id = ${userId} AND f.scope = ${system}
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
 * フォルダ一覧の先頭カードに出す。**その画面のアイテムだけ**を数える
 * （フォルダ一覧は共有でも、件数バーはいま見ている画面の話であるため）。
 */
export async function getFavoriteSummary(
  userId: string,
  scope: ItemScope,
): Promise<{ favorite_total: number; unfiled_favorite_count: number }> {
  const rows =
    scope === 'text_analysis'
      ? await sql`
          SELECT
            COUNT(*) FILTER (WHERE s.favorite)::int AS favorite_total,
            COUNT(*) FILTER (
              WHERE s.favorite AND NOT EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_key = s.id::text AND i.user_id = s.user_id AND i.scope = ${scope}
              )
            )::int AS unfiled_favorite_count
          FROM text_analysis_saves s
          WHERE s.user_id = ${userId}
        `
      : scope === 'library'
        ? await sql`
          SELECT
            COUNT(*) FILTER (WHERE l.is_favorite = 1)::int AS favorite_total,
            COUNT(*) FILTER (
              WHERE l.is_favorite = 1 AND NOT EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_key = l.id::text AND i.user_id = l.user_id AND i.scope = ${scope}
              )
            )::int AS unfiled_favorite_count
          FROM library l
          WHERE l.user_id = ${userId}
        `
        : await sql`
          SELECT
            COUNT(*) FILTER (WHERE s.is_favorite)::int AS favorite_total,
            COUNT(*) FILTER (
              WHERE s.is_favorite AND NOT EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_key = s.id::text AND i.user_id = s.user_id AND i.scope = ${scope}
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
 * 他人のフォルダIDや別体系のフォルダIDを渡されても入らないよう、INSERT は
 * 「自分の・その体系の」フォルダが実在するときだけ行を作る（INSERT ... SELECT ... WHERE EXISTS）。
 * 削除と追加は部分適用が起きないよう1トランザクションにまとめる（R-07）。
 */
export async function setItemFolders(
  userId: string,
  scope: ItemScope,
  itemKey: string,
  folderIds: number[],
): Promise<void> {
  const system = folderSystemOf(scope);
  const unique = Array.from(
    new Set(folderIds.map((n) => Number(n)).filter((n) => Number.isFinite(n))),
  );
  await sql.transaction([
    sql`DELETE FROM custom_folder_items
        WHERE user_id = ${userId} AND scope = ${scope} AND item_key = ${itemKey}`,
    ...unique.map(
      (fid) => sql`
        INSERT INTO custom_folder_items (folder_id, user_id, scope, item_key)
        SELECT ${fid}, ${userId}, ${scope}, ${itemKey}
        WHERE EXISTS (
          SELECT 1 FROM custom_folders
           WHERE id = ${fid} AND user_id = ${userId} AND scope = ${system}
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
  scope: ItemScope,
  itemKey: string | number,
): Promise<void> {
  await sql`DELETE FROM custom_folder_items
    WHERE user_id = ${userId} AND scope = ${scope} AND item_key = ${String(itemKey)}`;
}

/** 一括削除した記事の分類をまとめて外す（250の一括削除から呼ぶ） */
export async function detachItemsFromFolders(
  userId: string,
  scope: ItemScope,
  itemKeys: (string | number)[],
): Promise<void> {
  const keys = itemKeys.map((v) => String(v)).filter(Boolean);
  if (keys.length === 0) return;
  await sql`DELETE FROM custom_folder_items
    WHERE user_id = ${userId} AND scope = ${scope} AND item_key = ANY(${keys})`;
}
