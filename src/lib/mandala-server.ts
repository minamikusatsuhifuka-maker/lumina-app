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
import { episodeDisplayTitle } from '@/lib/episodes';
import {
  MANDALA_CENTER,
  MANDALA_DEPTH1_COUNT,
  isMandalaLinkScope,
  normalizeCellInput,
  type MandalaCell,
  type MandalaChartDetail,
  type MandalaChartSummary,
  type MandalaLinkLite,
  type MandalaLinkResolved,
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
 * link_count・primary_count（302 §5 一次情報ありのマス数）はリンク表から数える。
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
        WHERE x.chart_id = ch.id) AS link_count,
      -- 302 §5: 一次情報（📔エピソードのリンク）が1件以上ある埋まったマス数。一覧は軽い形のまま（本文を返さない）
      (SELECT COUNT(DISTINCT x.id)::int FROM mandala_cells x
         JOIN mandala_cell_links l ON l.cell_id = x.id AND l.scope = 'episode'
        WHERE x.chart_id = ch.id AND x.depth = 1
          AND (btrim(x.title, E' \\t\\r\\n　') <> '' OR btrim(x.body, E' \\t\\r\\n　') <> '')) AS primary_count,
      -- 305: 子マス（第2階層）の行数。削除の確認文に出す
      (SELECT COUNT(*)::int FROM mandala_cells x WHERE x.chart_id = ch.id AND x.depth = 2) AS child_count
    FROM mandala_charts ch
    WHERE ch.user_id = ${userId}
    ORDER BY ch.updated_at DESC, ch.id
  `) as { id: string; title: string; filled_count: number; filled_total: number; link_count: number; primary_count: number; child_count: number; created_at: string; updated_at: string }[];
  return rows.map((r) => ({
    id: String(r.id),
    title: r.title ?? '',
    filled_count: Number(r.filled_count ?? 0),
    filled_total: Number(r.filled_total ?? 0),
    link_count: Number(r.link_count ?? 0),
    primary_count: Number(r.primary_count ?? 0),
    child_count: Number(r.child_count ?? 0),
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

// ============================================================
// 302: リンク（mandala_cell_links）— 読み出し時に scope ごとにリンク先を解決する（R-92: 鍵と解決結果を分ける）
// ============================================================

type LinkRow = { id: number; cell_id: string; scope: string; item_key: string; note: string | null; created_at: string };

function toLinkLite(r: LinkRow): MandalaLinkLite {
  return { id: Number(r.id), cell_id: String(r.cell_id), scope: String(r.scope), item_key: String(r.item_key), created_at: String(r.created_at) };
}

/** チャート全体のリンク（軽い形。グリッドの件数・一次情報の導出用） */
export async function listLinksForChart(userId: string, chartId: string): Promise<MandalaLinkLite[]> {
  await ensureMandalaTables();
  const rows = (await sql`
    SELECT l.id, l.cell_id, l.scope, l.item_key, l.note, l.created_at
    FROM mandala_cell_links l
    JOIN mandala_cells c ON c.id = l.cell_id
    WHERE c.chart_id = ${chartId}::uuid AND l.user_id = ${userId}
    ORDER BY l.created_at ASC, l.id ASC
  `) as LinkRow[];
  return rows.map(toLinkLite);
}

type Resolved = { title: string; char_count: number; created_at: string };

/**
 * scope ごとにリンク先を引く（4テーブル・自分の行だけ）。無い鍵は Map に載らない＝exists=false。
 * タイトルは保存していない（読み出し時に解決＝リンク先で改題されても追随する）。
 */
async function resolveTargets(userId: string, scope: string, keys: string[]): Promise<Map<string, Resolved>> {
  const map = new Map<string, Resolved>();
  if (keys.length === 0) return map;
  if (scope === 'library') {
    const rows = (await sql`SELECT id::text AS k, title, LENGTH(content) AS n, created_at FROM library WHERE user_id = ${userId} AND id::text = ANY(${keys})`) as { k: string; title: string | null; n: number; created_at: string }[];
    for (const r of rows) map.set(String(r.k), { title: r.title ?? '', char_count: Number(r.n ?? 0), created_at: String(r.created_at) });
  } else if (scope === 'text_analysis') {
    const rows = (await sql`SELECT id::text AS k, auto_title, file_name, char_count AS n, created_at FROM text_analysis_saves WHERE user_id = ${userId} AND id::text = ANY(${keys})`) as { k: string; auto_title: string | null; file_name: string | null; n: number; created_at: string }[];
    for (const r of rows) map.set(String(r.k), { title: r.auto_title || r.file_name || '', char_count: Number(r.n ?? 0), created_at: String(r.created_at) });
  } else if (scope === 'context') {
    const rows = (await sql`SELECT id::text AS k, topic, LENGTH(context_text) AS n, created_at FROM context_saves WHERE user_id = ${userId} AND id::text = ANY(${keys})`) as { k: string; topic: string | null; n: number; created_at: string }[];
    for (const r of rows) map.set(String(r.k), { title: r.topic ?? '', char_count: Number(r.n ?? 0), created_at: String(r.created_at) });
  } else if (scope === 'episode') {
    const rows = (await sql`SELECT id::text AS k, title, period, situation, details,
        (LENGTH(title)+LENGTH(period)+LENGTH(situation)+LENGTH(feelings)+LENGTH(details)+LENGTH(thoughts)+LENGTH(reflection)) AS n, created_at
      FROM episode_records WHERE user_id = ${userId} AND id::text = ANY(${keys})`) as { k: string; title: string; period: string; situation: string; details: string; n: number; created_at: string }[];
    for (const r of rows) {
      map.set(String(r.k), {
        title: episodeDisplayTitle({ title: r.title ?? '', period: r.period ?? '', situation: r.situation ?? '', details: r.details ?? '' }),
        char_count: Number(r.n ?? 0),
        created_at: String(r.created_at),
      });
    }
  }
  return map;
}

/** マス1つのリンク一覧（解決済み）。他人／存在しないマスは null */
export async function listLinksForCellResolved(userId: string, cellId: string): Promise<MandalaLinkResolved[] | null> {
  await ensureMandalaTables();
  const [cell] = (await sql`SELECT id FROM mandala_cells WHERE id = ${cellId}::uuid AND user_id = ${userId}`) as { id: string }[];
  if (!cell) return null;
  const rows = (await sql`
    SELECT id, cell_id, scope, item_key, note, created_at FROM mandala_cell_links
    WHERE cell_id = ${cellId}::uuid AND user_id = ${userId}
    ORDER BY created_at ASC, id ASC
  `) as LinkRow[];
  const byScope = new Map<string, string[]>();
  for (const r of rows) (byScope.get(r.scope) ?? byScope.set(r.scope, []).get(r.scope)!).push(String(r.item_key));
  const resolved = new Map<string, Map<string, Resolved>>();
  for (const [scope, keys] of byScope) {
    // 解決は付加情報。1種別の失敗で一覧全体を落とさない（R-39）＝失敗した種別は exists=false で返す
    try {
      resolved.set(scope, await resolveTargets(userId, scope, keys));
    } catch (e) {
      console.error('[mandala links] 解決に失敗:', scope, e instanceof Error ? e.message : 'unknown');
      resolved.set(scope, new Map());
    }
  }
  return rows.map((r) => {
    const hit = resolved.get(r.scope)?.get(String(r.item_key));
    return {
      ...toLinkLite(r),
      note: r.note ?? '',
      title: hit ? hit.title : null,
      exists: !!hit,
      char_count: hit ? hit.char_count : null,
      item_created_at: hit ? hit.created_at : null,
    };
  });
}

export interface AddLinksResult {
  added: string[];
  unchanged: string[];
  failed: string[];
}

/**
 * §4-2 複数を1リクエストで付ける。項目ごとに独立して実行し、1件の失敗で他を巻き戻さない（R-39）。
 * - scope が許容値外／リンク先が自分の行として存在しない → failed
 * - 既にリンク済み → ON CONFLICT DO NOTHING で unchanged（一意制約にぶつけて失敗させない）
 * - 二重発火の再送は同じ理由で unchanged になる（サーバー側の遮断・R-87）
 * 他人／存在しないマスは null
 */
export async function addLinks(
  userId: string,
  cellId: string,
  items: { scope: unknown; item_key: unknown }[],
): Promise<AddLinksResult | null> {
  await ensureMandalaTables();
  const [cell] = (await sql`SELECT id FROM mandala_cells WHERE id = ${cellId}::uuid AND user_id = ${userId}`) as { id: string }[];
  if (!cell) return null;
  const result: AddLinksResult = { added: [], unchanged: [], failed: [] };
  // scope ごとに存在確認をまとめて1回
  const byScope = new Map<string, string[]>();
  const wanted: { scope: string; key: string; tag: string }[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = typeof it.item_key === 'string' || typeof it.item_key === 'number' ? String(it.item_key).trim() : '';
    const tag = `${String(it.scope)}:${key}`;
    if (!isMandalaLinkScope(it.scope) || !key) { result.failed.push(tag); continue; }
    if (seen.has(tag)) continue;
    seen.add(tag);
    wanted.push({ scope: it.scope, key, tag });
    (byScope.get(it.scope) ?? byScope.set(it.scope, []).get(it.scope)!).push(key);
  }
  const exists = new Map<string, Map<string, Resolved>>();
  for (const [scope, keys] of byScope) {
    try {
      exists.set(scope, await resolveTargets(userId, scope, keys));
    } catch (e) {
      console.error('[mandala links] 存在確認に失敗:', scope, e instanceof Error ? e.message : 'unknown');
      exists.set(scope, new Map());
    }
  }
  for (const w of wanted) {
    if (!exists.get(w.scope)?.has(w.key)) { result.failed.push(w.tag); continue; }
    try {
      const rows = (await sql`
        INSERT INTO mandala_cell_links (cell_id, user_id, scope, item_key)
        VALUES (${cellId}::uuid, ${userId}, ${w.scope}, ${w.key})
        ON CONFLICT DO NOTHING
        RETURNING id
      `) as { id: number }[];
      (rows.length > 0 ? result.added : result.unchanged).push(w.tag);
    } catch (e) {
      console.error('[mandala links] 追加に失敗:', w.tag, e instanceof Error ? e.message : 'unknown');
      result.failed.push(w.tag);
    }
  }
  return result;
}

/** リンクを外す（非破壊: 記事は消えない）。他人／存在しない id は false */
export async function removeLink(userId: string, linkId: number): Promise<boolean> {
  await ensureMandalaTables();
  const rows = (await sql`DELETE FROM mandala_cell_links WHERE id = ${linkId} AND user_id = ${userId} RETURNING id`) as { id: number }[];
  return rows.length > 0;
}

// ============================================================
// 305: 第2階層（81マス）の展開 — 親マスの子8マス（position 4 を除く）を1文で作る
// ============================================================

export type ExpandResult =
  | { ok: true; created: boolean; children: MandalaCell[] }
  | { ok: false; reason: 'not_found' | 'not_depth1' };

/**
 * §2-4 未展開ブロックの子8マスを**1文（INSERT ... SELECT generate_series ... WHERE p <> 4）**で作る＝8件が揃うか0件か。
 * 既に展開済み（子が1行でもある）なら NOT EXISTS で1行も入れず、読み直して返す（二重発火・R-87）。
 * 万一 NOT EXISTS をすり抜けて一意制約（chart_id, COALESCE(parent,''), position）に当たった場合も
 * 「作成済み」として読み直す（23505 を握る＝偽の失敗を返さない）。親が空（無題）でも展開できる。
 * position 4（中央）は作らない（CHECK 制約でも禁止・§4-3②）。
 */
export async function expandCell(userId: string, chartId: string, parentCellId: string): Promise<ExpandResult> {
  await ensureMandalaTables();
  const [parent] = (await sql`
    SELECT id, depth FROM mandala_cells WHERE id = ${parentCellId}::uuid AND chart_id = ${chartId}::uuid AND user_id = ${userId}
  `) as { id: string; depth: number }[];
  if (!parent) return { ok: false, reason: 'not_found' };
  if (Number(parent.depth) !== 1) return { ok: false, reason: 'not_depth1' };
  let created = false;
  try {
    const rows = (await sql`
      INSERT INTO mandala_cells (chart_id, user_id, parent_cell_id, depth, position)
      SELECT ${chartId}::uuid, ${userId}, ${parentCellId}::uuid, 2, p
      FROM generate_series(0, 8) AS p
      WHERE p <> ${MANDALA_CENTER}
        AND NOT EXISTS (SELECT 1 FROM mandala_cells e WHERE e.parent_cell_id = ${parentCellId}::uuid)
      RETURNING id
    `) as { id: string }[];
    created = rows.length > 0;
    if (created && rows.length !== MANDALA_DEPTH1_COUNT - 1) {
      // 1文なので起こり得ないが、偽の成功を返さない（R-05）
      throw new Error(`展開で子マスが${rows.length}件しか作られませんでした`);
    }
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== '23505') throw e; // 一意制約＝作成済み。それ以外は失敗
  }
  const children = (await sql`
    SELECT id, chart_id, parent_cell_id, depth, position, title, body, meta, created_at, updated_at
    FROM mandala_cells WHERE parent_cell_id = ${parentCellId}::uuid AND user_id = ${userId}
    ORDER BY position
  `) as CellRow[];
  return { ok: true, created, children: children.map(toCell) };
}

// ============================================================
// 307: Kindle 目次の材料（チャート全体のリンクを解決済みで返す／起こした本の一覧）
// ============================================================

/**
 * チャート全体のリンクを解決済み（title/exists/char_count）で返す。scope ごとに1クエリ（マスごとに引かない）。
 * 解決は付加情報＝1種別の失敗で全体を落とさない（R-39: 失敗した種別は exists=false）
 */
export async function listLinksForChartResolved(userId: string, chartId: string): Promise<MandalaLinkResolved[]> {
  await ensureMandalaTables();
  const rows = (await sql`
    SELECT l.id, l.cell_id, l.scope, l.item_key, l.note, l.created_at
    FROM mandala_cell_links l
    JOIN mandala_cells c ON c.id = l.cell_id
    WHERE c.chart_id = ${chartId}::uuid AND l.user_id = ${userId}
    ORDER BY l.created_at ASC, l.id ASC
  `) as LinkRow[];
  const byScope = new Map<string, string[]>();
  for (const r of rows) (byScope.get(r.scope) ?? byScope.set(r.scope, []).get(r.scope)!).push(String(r.item_key));
  const resolved = new Map<string, Map<string, Resolved>>();
  for (const [scope, keys] of byScope) {
    try {
      resolved.set(scope, await resolveTargets(userId, scope, [...new Set(keys)]));
    } catch (e) {
      console.error('[mandala links] 解決に失敗:', scope, e instanceof Error ? e.message : 'unknown');
      resolved.set(scope, new Map());
    }
  }
  return rows.map((r) => {
    const hit = resolved.get(r.scope)?.get(String(r.item_key));
    return {
      ...toLinkLite(r),
      note: r.note ?? '',
      title: hit ? hit.title : null,
      exists: !!hit,
      char_count: hit ? hit.char_count : null,
      item_created_at: hit ? hit.created_at : null,
    };
  });
}

export interface MandalaBookRef {
  id: number;
  title: string;
  status: string;
  importedAt: string;
  created_at: string;
}

/**
 * §3-4 「📕 起こした本: n件」の導出。本の側の記録（kindle_books.book_meta.mandala.chartId）から読み出す
 * （mandala_charts.meta には書かない・R-107）。所有者の本だけ・新しい順
 */
export async function listBooksFromChart(userId: string, chartId: string): Promise<MandalaBookRef[]> {
  const rows = (await sql`
    SELECT id, title, status, book_meta->'mandala'->>'importedAt' AS imported_at, created_at
    FROM kindle_books
    WHERE user_id = ${userId}
      AND book_meta->'mandala'->>'source' = 'mandala'
      AND book_meta->'mandala'->>'chartId' = ${chartId}
    ORDER BY created_at DESC
    LIMIT 100
  `) as { id: number; title: string | null; status: string | null; imported_at: string | null; created_at: string }[];
  return rows.map((r) => ({
    id: Number(r.id),
    title: r.title ?? '',
    status: r.status ?? '',
    importedAt: r.imported_at ?? String(r.created_at),
    created_at: String(r.created_at),
  }));
}
