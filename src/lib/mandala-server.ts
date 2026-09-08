// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラチャート — サーバ専用（DB）
//
// 保存先は専用テーブル3つ（§4-2）。DDL は ensureMandalaTables の冪等（CREATE TABLE/INDEX IF NOT EXISTS のみ・
// 既存テーブルの ALTER なし）に収まる範囲＝停止条件①の例外。所有者の扱いは 281/297 と同じ user_id text。
//
//   mandala_charts      … チャート1枚。名前は持たない（中央マスのタイトルがチャート名・§3-5・R-74）。meta は 305/307 の受け皿
//   mandala_cells       … マス。(chart_id, parent_cell_id, position) で一意。depth=1 は親なし、depth=2 は親必須かつ
//                         position<>4（中央は保存しない・§4-3②）。チャート削除で ON DELETE CASCADE
//   mandala_cell_links  … マス⇄外部アイテム（scope 文字列＋item_key text）。UI は 302。マス削除で CASCADE
//
// チャート作成は「チャート＋第1階層9マス」を**1文（CTE）**で書く＝マスの INSERT が1つでも失敗すればチャートも
// 残らない（fail-closed・R-07）。保存はマス単位。同じ内容の再送は書かずに現在行を返す（R-87 のサーバ側遮断）。
// クライアントへ渡す純関数・定数は mandala-shared.ts（DB 非依存・R-108）。ここからは `import type` と値の両方を使ってよい。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { sql } from '@/lib/db';
import { sanitizeForDb } from '@/lib/sanitize';
import {
  MANDALA_CENTER,
  MANDALA_DEPTH1_COUNT,
  normalizeCellInput,
  type MandalaCell,
  type MandalaChartDetail,
  type MandalaChartSummary,
} from '@/lib/mandala-shared';

// ============================================================
// スキーマ（冪等DDL・プロセス内で1回だけ）
// ============================================================

let tablesReady: Promise<void> | null = null;

export function ensureMandalaTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS mandala_charts (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    text NOT NULL,
        meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_mandala_charts_user
        ON mandala_charts (user_id, updated_at DESC)`;
      await sql`CREATE TABLE IF NOT EXISTS mandala_cells (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        chart_id       uuid NOT NULL REFERENCES mandala_charts(id) ON DELETE CASCADE,
        user_id        text NOT NULL,
        parent_cell_id uuid NULL REFERENCES mandala_cells(id) ON DELETE CASCADE,
        depth          smallint NOT NULL,
        position       smallint NOT NULL,
        title          text NOT NULL DEFAULT '',
        body           text NOT NULL DEFAULT '',
        meta           jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mandala_cells_depth_chk CHECK (depth IN (1, 2)),
        CONSTRAINT mandala_cells_position_chk CHECK (position BETWEEN 0 AND 8),
        CONSTRAINT mandala_cells_parent_chk CHECK (
          (depth = 1 AND parent_cell_id IS NULL)
          OR (depth = 2 AND parent_cell_id IS NOT NULL AND position <> 4)
        )
      )`;
      // (chart_id, parent_cell_id, position) の一意。parent が NULL の第1階層も一意にするため COALESCE で潰す
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_mandala_cells_slot
        ON mandala_cells (chart_id, COALESCE(parent_cell_id::text, ''), position)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_mandala_cells_chart
        ON mandala_cells (chart_id, depth, position)`;
      await sql`CREATE TABLE IF NOT EXISTS mandala_cell_links (
        id         serial PRIMARY KEY,
        cell_id    uuid NOT NULL REFERENCES mandala_cells(id) ON DELETE CASCADE,
        user_id    text NOT NULL,
        scope      text NOT NULL,
        item_key   text NOT NULL,
        note       text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_mandala_cell_links_uniq
        ON mandala_cell_links (cell_id, scope, item_key)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_mandala_cell_links_item
        ON mandala_cell_links (user_id, scope, item_key)`;
    })().catch((e) => {
      tablesReady = null; // 失敗時は次回に再試行できるようにする
      throw e;
    });
  }
  return tablesReady;
}

// ============================================================
// 行 → 型
// ============================================================

type CellRow = {
  id: string;
  chart_id: string;
  parent_cell_id: string | null;
  depth: number;
  position: number;
  title: string;
  body: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function toCell(r: CellRow): MandalaCell {
  return {
    id: String(r.id),
    chart_id: String(r.chart_id),
    parent_cell_id: r.parent_cell_id ? String(r.parent_cell_id) : null,
    depth: Number(r.depth) === 2 ? 2 : 1,
    position: Number(r.position),
    title: r.title ?? '',
    body: r.body ?? '',
    meta: r.meta && typeof r.meta === 'object' ? r.meta : {},
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

// ============================================================
// 読み取り
// ============================================================

/**
 * §4-3⑥ 一覧＝本文を含まない軽い形。title は中央マス（depth=1, position=4）のタイトル。
 * 「埋まっている」の判定は mandala-shared.isCellFilled（trim で空白以外があるか）と同じ意味を SQL で書く。
 * link_count は 302 以降で増える（本便は常に 0）。
 */
export async function listCharts(userId: string): Promise<MandalaChartSummary[]> {
  await ensureMandalaTables();
  const rows = (await sql`
    SELECT ch.id, ch.created_at, ch.updated_at,
      COALESCE((SELECT x.title FROM mandala_cells x
                 WHERE x.chart_id = ch.id AND x.depth = 1 AND x.position = ${MANDALA_CENTER}), '') AS title,
      (SELECT COUNT(*)::int FROM mandala_cells x
        WHERE x.chart_id = ch.id AND x.depth = 1
          AND (btrim(x.title, E' \\t\\r\\n　') <> '' OR btrim(x.body, E' \\t\\r\\n　') <> '')) AS filled_count,
      (SELECT COUNT(*)::int FROM mandala_cells x
        WHERE x.chart_id = ch.id
          AND (btrim(x.title, E' \\t\\r\\n　') <> '' OR btrim(x.body, E' \\t\\r\\n　') <> '')) AS filled_total,
      (SELECT COUNT(*)::int FROM mandala_cell_links l
         JOIN mandala_cells x ON x.id = l.cell_id
        WHERE x.chart_id = ch.id) AS link_count
    FROM mandala_charts ch
    WHERE ch.user_id = ${userId}
    ORDER BY ch.updated_at DESC, ch.id
  `) as { id: string; title: string; filled_count: number; filled_total: number; link_count: number; created_at: string; updated_at: string }[];
  return rows.map((r) => ({
    id: String(r.id),
    title: r.title ?? '',
    filled_count: Number(r.filled_count ?? 0),
    filled_total: Number(r.filled_total ?? 0),
    link_count: Number(r.link_count ?? 0),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

/** §4-3⑥ チャート単位＝全マス本文を返す形。他人のチャート・存在しない id は null */
export async function getChart(userId: string, chartId: string): Promise<MandalaChartDetail | null> {
  await ensureMandalaTables();
  const [chart] = (await sql`
    SELECT id, meta, created_at, updated_at FROM mandala_charts
    WHERE id = ${chartId}::uuid AND user_id = ${userId}
  `) as { id: string; meta: Record<string, unknown> | null; created_at: string; updated_at: string }[];
  if (!chart) return null;
  const rows = (await sql`
    SELECT id, chart_id, parent_cell_id, depth, position, title, body, meta, created_at, updated_at
    FROM mandala_cells
    WHERE chart_id = ${chartId}::uuid AND user_id = ${userId}
    ORDER BY depth, position
  `) as CellRow[];
  return {
    id: String(chart.id),
    meta: chart.meta && typeof chart.meta === 'object' ? chart.meta : {},
    created_at: String(chart.created_at),
    updated_at: String(chart.updated_at),
    cells: rows.map(toCell),
  };
}

// ============================================================
// 書き込み
// ============================================================

/**
 * §4-2 チャート作成＝第1階層の9マスを**同時に**作る。CTE 1文なので、マスの INSERT が失敗すればチャートも残らない
 * （fail-closed・R-07）。返す行数が 9 でなければ例外（偽の成功を返さない・R-05）。
 */
export async function createChart(userId: string): Promise<MandalaChartDetail> {
  await ensureMandalaTables();
  const rows = (await sql`
    WITH c AS (
      INSERT INTO mandala_charts (user_id) VALUES (${userId}) RETURNING id
    )
    INSERT INTO mandala_cells (chart_id, user_id, depth, position)
    SELECT c.id, ${userId}, 1, p FROM c, generate_series(0, 8) AS p
    RETURNING id, chart_id, parent_cell_id, depth, position, title, body, meta, created_at, updated_at
  `) as CellRow[];
  if (rows.length !== MANDALA_DEPTH1_COUNT) {
    throw new Error(`チャート作成でマスが${rows.length}件しか作られませんでした（期待 ${MANDALA_DEPTH1_COUNT}）`);
  }
  const chartId = String(rows[0].chart_id);
  const detail = await getChart(userId, chartId);
  if (!detail) throw new Error('作成したチャートを読み戻せませんでした');
  return detail;
}

export type SaveCellResult =
  | { ok: true; cell: MandalaCell; unchanged: boolean }
  | { ok: false; reason: 'not_found' };

/**
 * §4-4 マス単位の保存。空で保存＝マスを空に戻す操作（正常）。存在しない／他人の cell_id は not_found。
 * 同じ内容の再送（R-87 の二重発火がクライアントの ref をすり抜けた場合）は**書かずに**現在行を返す
 * （IS DISTINCT FROM で差分があるときだけ UPDATE・updated_at も進めない）。
 * 変更があったときはチャートの updated_at も同じ文（CTE）で進める＝一覧の並びが追随する。
 */
export async function saveCell(
  userId: string,
  cellId: string,
  input: { title?: unknown; body?: unknown },
): Promise<SaveCellResult> {
  await ensureMandalaTables();
  const normalized = normalizeCellInput(input);
  const title = sanitizeForDb(normalized.title);
  const body = sanitizeForDb(normalized.body);
  const updated = (await sql`
    WITH u AS (
      UPDATE mandala_cells
      SET title = ${title}, body = ${body}, updated_at = now()
      WHERE id = ${cellId}::uuid AND user_id = ${userId}
        AND (title IS DISTINCT FROM ${title} OR body IS DISTINCT FROM ${body})
      RETURNING id, chart_id, parent_cell_id, depth, position, title, body, meta, created_at, updated_at
    ), bump AS (
      UPDATE mandala_charts SET updated_at = now()
      WHERE id IN (SELECT chart_id FROM u)
    )
    SELECT * FROM u
  `) as CellRow[];
  if (updated.length > 0) return { ok: true, cell: toCell(updated[0]), unchanged: false };
  // 差分なし（同一内容の再送）か、存在しない／他人の id か
  const [current] = (await sql`
    SELECT id, chart_id, parent_cell_id, depth, position, title, body, meta, created_at, updated_at
    FROM mandala_cells WHERE id = ${cellId}::uuid AND user_id = ${userId}
  `) as CellRow[];
  if (!current) return { ok: false, reason: 'not_found' };
  return { ok: true, cell: toCell(current), unchanged: true };
}

/**
 * チャート削除。マス・リンクは ON DELETE CASCADE で同時に消える（孤立しない・§4-2）。
 * 返り値は消えたマス数（確認文の件数と突き合わせられるように）。存在しない／他人は null。
 */
export async function deleteChart(userId: string, chartId: string): Promise<{ cells: number; links: number } | null> {
  await ensureMandalaTables();
  const [counts] = (await sql`
    SELECT
      (SELECT COUNT(*)::int FROM mandala_cells x WHERE x.chart_id = ch.id) AS cells,
      (SELECT COUNT(*)::int FROM mandala_cell_links l JOIN mandala_cells x ON x.id = l.cell_id WHERE x.chart_id = ch.id) AS links
    FROM mandala_charts ch
    WHERE ch.id = ${chartId}::uuid AND ch.user_id = ${userId}
  `) as { cells: number; links: number }[];
  if (!counts) return null;
  const rows = (await sql`
    DELETE FROM mandala_charts WHERE id = ${chartId}::uuid AND user_id = ${userId} RETURNING id
  `) as { id: string }[];
  if (rows.length === 0) return null;
  return { cells: Number(counts.cells ?? 0), links: Number(counts.links ?? 0) };
}
