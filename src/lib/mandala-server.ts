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
  isCellFilled,
  isMandalaLinkScope,
  isPresetPlaceholder,
  isSameReaction,
  mergeReaction,
  normalizeCellInput,
  parseReaction,
  type MandalaCell,
  type MandalaReaction,
  type MandalaReactionX,
  type MandalaTier,
  type MandalaChartDetail,
  type MandalaChartSummary,
  type MandalaLinkLite,
  type MandalaLinkResolved,
} from '@/lib/mandala-shared';
import { MANDALA_PRESET_KEYS, MANDALA_PRESETS, presetCellRows, type MandalaPresetKey } from '@/lib/mandala-presets';
import { MANDALA_RESEARCH_REJECT_NO_THEME, MANDALA_RESEARCH_REJECT_PLACEHOLDER, MANDALA_RESEARCH_REJECT_RUNNING, canOrderResearch, parseResearchMeta, type MandalaResearchKind, type MandalaResearchRef } from '@/lib/mandala-research';

/** 311是正: 型の初期タイトル（position, title）の平坦な配列。一覧 SQL の「未記入」判定（isPresetPlaceholder と同じ意味）に渡す */
function presetInitialPairs(): { positions: number[]; titles: string[] } {
  const positions: number[] = [];
  const titles: string[] = [];
  for (const key of MANDALA_PRESET_KEYS) {
    for (const c of MANDALA_PRESETS[key].cells) {
      positions.push(c.position);
      titles.push(c.title.trim());
    }
  }
  return { positions, titles };
}

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
 * 「記述あり」の判定は mandala-shared.isCellWritten と同じ意味を SQL で書く（CTE written）:
 *   埋まっている（trim で空白以外がある）かつ、未記入（meta.tier あり・本文空・タイトルが型の初期値のまま）でない（311是正）。
 * link_count・primary_count（302 §5 一次情報ありのマス数）はリンク表から数える。
 */
export async function listCharts(userId: string): Promise<MandalaChartSummary[]> {
  await ensureMandalaTables();
  const preset = presetInitialPairs();
  const rows = (await sql`
    WITH written AS (
      SELECT x.id, x.chart_id, x.depth, x.meta
      FROM mandala_cells x
      WHERE x.user_id = ${userId}
        AND (btrim(x.title, E' \\t\\r\\n　') <> '' OR btrim(x.body, E' \\t\\r\\n　') <> '')
        AND NOT (
          x.meta ? 'tier'
          AND btrim(x.body, E' \\t\\r\\n　') = ''
          AND EXISTS (SELECT 1 FROM unnest(${preset.positions}::int[], ${preset.titles}::text[]) AS p(pos, t)
                       WHERE p.pos = x.position AND p.t = btrim(x.title, E' \\t\\r\\n　'))
        )
    )
    SELECT ch.id, ch.created_at, ch.updated_at,
      COALESCE((SELECT x.title FROM mandala_cells x
                 WHERE x.chart_id = ch.id AND x.depth = 1 AND x.position = ${MANDALA_CENTER}), '') AS title,
      (SELECT COUNT(*)::int FROM written w WHERE w.chart_id = ch.id AND w.depth = 1) AS filled_count,
      (SELECT COUNT(*)::int FROM written w WHERE w.chart_id = ch.id) AS filled_total,
      (SELECT COUNT(*)::int FROM mandala_cell_links l
         JOIN mandala_cells x ON x.id = l.cell_id
        WHERE x.chart_id = ch.id) AS link_count,
      -- 302 §5: 一次情報（📔エピソードのリンク）が1件以上ある記述ありのマス数。一覧は軽い形のまま（本文を返さない）
      (SELECT COUNT(DISTINCT w.id)::int FROM written w
         JOIN mandala_cell_links l ON l.cell_id = w.id AND l.scope = 'episode'
        WHERE w.chart_id = ch.id AND w.depth = 1) AS primary_count,
      -- 305: 子マス（第2階層）の行数。削除の確認文に出す
      (SELECT COUNT(*)::int FROM mandala_cells x WHERE x.chart_id = ch.id AND x.depth = 2) AS child_count,
      -- 308: 反応記録のある記述ありのマス数（第1階層）。一覧は軽い形のまま（本文を返さない）
      (SELECT COUNT(*)::int FROM written w
        WHERE w.chart_id = ch.id AND w.depth = 1 AND w.meta ? 'reaction') AS reaction_count,
      -- 308: 型（meta.preset）。無ければ null
      ch.meta->>'preset' AS preset,
      -- 316: 記事から生成（meta.generated）。一覧の「🤖 記事から生成」バッジ用（元記事のタイトルだけ）
      ch.meta->'generated'->'source'->>'title' AS generated_title,
      ch.meta->'generated'->>'mode' AS generated_mode,
      -- 324: 図解プランから作成（meta.origin='visual_plan'）
      ch.meta->>'origin' AS origin
    FROM mandala_charts ch
    WHERE ch.user_id = ${userId}
    ORDER BY ch.updated_at DESC, ch.id
  `) as { id: string; title: string; filled_count: number; filled_total: number; link_count: number; primary_count: number; child_count: number; reaction_count: number; preset: string | null; origin: string | null; generated_title: string | null; generated_mode: string | null; created_at: string; updated_at: string }[];
  return rows.map((r) => ({
    id: String(r.id),
    title: r.title ?? '',
    filled_count: Number(r.filled_count ?? 0),
    filled_total: Number(r.filled_total ?? 0),
    link_count: Number(r.link_count ?? 0),
    primary_count: Number(r.primary_count ?? 0),
    child_count: Number(r.child_count ?? 0),
    reaction_count: Number(r.reaction_count ?? 0),
    preset: r.preset ? String(r.preset) : null,
    generated: r.generated_mode ? { title: r.generated_title ?? '', mode: r.generated_mode === '81' ? '81' : '9' } : null,
    origin: r.origin ? String(r.origin) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

// ============================================================
// 316: 記事→マンダラ生成のサーバ側（画面を経由せず 301/305/302 の関数と同じ文で書く）
// ============================================================

/** チャート meta のキー単位マージ（R-113）。null のキーは消す */
export async function updateChartMeta(userId: string, chartId: string, patch: Record<string, unknown | null>): Promise<boolean> {
  await ensureMandalaTables();
  const remove = Object.entries(patch).filter(([, v]) => v === null).map(([k]) => k);
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== null && v !== undefined) set[k] = v;
  const rows = (await sql`
    UPDATE mandala_charts SET meta = (COALESCE(meta, '{}'::jsonb) - ${remove}::text[]) || ${JSON.stringify(set)}::jsonb, updated_at = now()
    WHERE id = ${chartId}::uuid AND user_id = ${userId} RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

/** 生成したマスを1文で書き込む（title/body と meta.origin='ai'。他の meta キーは残す） */
export async function writeGeneratedCells(userId: string, rows: readonly { id: string; title: string; body: string }[]): Promise<number> {
  await ensureMandalaTables();
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const titles = rows.map((r) => sanitizeForDb(r.title));
  const bodies = rows.map((r) => sanitizeForDb(r.body));
  const updated = (await sql`
    UPDATE mandala_cells c
    SET title = x.t, body = x.b, meta = c.meta || '{"origin":"ai"}'::jsonb, updated_at = now()
    FROM unnest(${ids}::uuid[], ${titles}::text[], ${bodies}::text[]) AS x(id, t, b)
    WHERE c.id = x.id AND c.user_id = ${userId}
    RETURNING c.id
  `) as { id: string }[];
  return updated.length;
}

/** 324: 図解プラン（9マスシート）の文字列をそのまま書く（AI なし・origin は付けない＝院長が承認した文字列は手書き扱い） */
export async function writePlanCells(userId: string, rows: readonly { id: string; title: string; body: string }[]): Promise<number> {
  await ensureMandalaTables();
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const titles = rows.map((r) => sanitizeForDb(r.title));
  const bodies = rows.map((r) => sanitizeForDb(r.body));
  const updated = (await sql`
    UPDATE mandala_cells c
    SET title = x.t, body = x.b, updated_at = now()
    FROM unnest(${ids}::uuid[], ${titles}::text[], ${bodies}::text[]) AS x(id, t, b)
    WHERE c.id = x.id AND c.user_id = ${userId}
    RETURNING c.id
  `) as { id: string }[];
  return updated.length;
}

/** 再生成の前処理: 子マス（第2階層）とチャートのリンクを消し、第1階層を空に戻す（origin も消す）。edited があるときは呼ばない（R-76） */
export async function resetGeneratedChart(userId: string, chartId: string): Promise<void> {
  await ensureMandalaTables();
  await sql`DELETE FROM mandala_cell_links l USING mandala_cells x WHERE l.cell_id = x.id AND x.chart_id = ${chartId}::uuid AND x.user_id = ${userId}`;
  await sql`DELETE FROM mandala_cells WHERE chart_id = ${chartId}::uuid AND user_id = ${userId} AND depth = 2`;
  await sql`UPDATE mandala_cells SET title = '', body = '', meta = meta - 'origin', updated_at = now() WHERE chart_id = ${chartId}::uuid AND user_id = ${userId} AND depth = 1`;
}

/**
 * 316 R-87（サーバ側・DB）: 同じ記事（key）から**進行中**（meta.generating）か**直近に生成済み**（meta.generated.generatedAt）の
 * チャートがあれば返す。インスタンス内の Map だけでは別インスタンスに届かないため DB で見る
 */
export async function findRecentGeneration(userId: string, key: string, windowMs: number, nowMs: number): Promise<{ chartId: string; state: 'generating' | 'generated'; at: string } | null> {
  await ensureMandalaTables();
  const rows = (await sql`
    SELECT id::text AS id, meta FROM mandala_charts
    WHERE user_id = ${userId} AND (meta->'generating'->>'key' = ${key} OR meta->'generated'->>'key' = ${key})
    ORDER BY updated_at DESC LIMIT 5
  `) as { id: string; meta: Record<string, unknown> | null }[];
  for (const r of rows) {
    const m = r.meta ?? {};
    const gg = (m.generating ?? null) as { key?: string; startedAt?: string } | null;
    if (gg && gg.key === key && typeof gg.startedAt === 'string' && nowMs - Date.parse(gg.startedAt) < windowMs) return { chartId: r.id, state: 'generating', at: gg.startedAt };
    const gd = (m.generated ?? null) as { key?: string; generatedAt?: string } | null;
    if (gd && gd.key === key && typeof gd.generatedAt === 'string' && nowMs - Date.parse(gd.generatedAt) < windowMs) return { chartId: r.id, state: 'generated', at: gd.generatedAt };
  }
  return null;
}

/** 要点1つの子マスを消す（その要点だけ再生成するとき）。edited の子があれば呼ばない */
export async function deleteChildren(userId: string, parentCellId: string): Promise<number> {
  await ensureMandalaTables();
  const rows = (await sql`DELETE FROM mandala_cells WHERE parent_cell_id = ${parentCellId}::uuid AND user_id = ${userId} RETURNING id`) as { id: string }[];
  return rows.length;
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
export async function createChart(userId: string, preset: MandalaPresetKey | null = null): Promise<MandalaChartDetail> {
  await ensureMandalaTables();
  // 308 §2-2: 型プリセットは作成時にだけ適用。既定（preset なし）の文は 301 のまま（R-88）。
  // 型のときも同じ CTE 1文（本＋9マスが揃うか0か）。周囲8のタイトルと meta.tier は lib/mandala-presets.ts の定義そのまま
  const rows = (preset
    ? await (() => {
        const cellsDef = presetCellRows(preset);
        const positions = cellsDef.map((c) => c.position);
        const titles = cellsDef.map((c) => c.title);
        const metas = cellsDef.map((c) => JSON.stringify(c.meta));
        return sql`
          WITH c AS (
            INSERT INTO mandala_charts (user_id, meta) VALUES (${userId}, ${JSON.stringify({ preset })}::jsonb) RETURNING id
          )
          INSERT INTO mandala_cells (chart_id, user_id, depth, position, title, meta)
          SELECT c.id, ${userId}, 1, x.p, x.t, x.m::jsonb
          FROM c, unnest(${positions}::int[], ${titles}::text[], ${metas}::text[]) AS x(p, t, m)
          RETURNING id, chart_id, parent_cell_id, depth, position, title, body, meta, created_at, updated_at
        `;
      })()
    : await sql`
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
  // 309: 部分更新＝省略した欄（undefined）は変えない（body だけ送ると title が '' に潰れていた・R-113 309追記）。
  // パネルは常に両方送るので従来の挙動は不変。null／空文字は「空にする」の明示
  const hasTitle = input.title !== undefined;
  const hasBody = input.body !== undefined;
  const normalized = normalizeCellInput(input);
  const title = sanitizeForDb(normalized.title);
  const body = sanitizeForDb(normalized.body);
  const updated = (await sql`
    WITH u AS (
      UPDATE mandala_cells
      SET title = CASE WHEN ${hasTitle} THEN ${title} ELSE title END,
          body = CASE WHEN ${hasBody} THEN ${body} ELSE body END,
          -- 316 §3-5: AI 生成のマス（origin='ai'）は院長が内容を変えた時点で 'edited' に（キー単位・R-113）。他のキーは触らない
          meta = CASE WHEN meta->>'origin' = 'ai' THEN meta || '{"origin":"edited"}'::jsonb ELSE meta END,
          updated_at = now()
      WHERE id = ${cellId}::uuid AND user_id = ${userId}
        AND ((${hasTitle} AND title IS DISTINCT FROM ${title}) OR (${hasBody} AND body IS DISTINCT FROM ${body}))
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

function MANDALA_HAS_NOTE(r: MandalaReaction): boolean {
  return ['views', 'likes', 'shares', 'purchases'].some((k) => typeof (r as unknown as Record<string, unknown>)[k] === 'number') || !!r.memo;
}
function isSameReactionX(a: MandalaReactionX | null, b: Omit<MandalaReactionX, 'recordedAt'> | null): boolean {
  if (!a || !b) return (a === null || a === undefined) && (b === null || b === undefined);
  return (['impressions', 'likes', 'reposts', 'shares', 'profileClicks'] as const).every((k) => (a[k] ?? null) === (b[k] ?? null)) && (a.memo ?? '') === (b.memo ?? '');
}

export type UpdateCellMetaResult =
  | { ok: true; cell: MandalaCell; unchanged: boolean }
  | { ok: false; reason: 'not_found' };

/**
 * 308 §3-2／§5: meta の**キー単位マージ**（`jsonb - keys || patch`）。tier／reaction 以外のキーは潰さない。
 * reaction=null はキーを消す（全部空＝記録なし）。同一内容の再送は書かずに現在行を返す（R-87 のサーバ側）。
 * meta を丸ごと置き換える経路はここにも他にも作らない
 */
export async function updateCellMeta(
  userId: string,
  cellId: string,
  patch: {
    tier?: MandalaTier;
    /** note 側の反応（308）。null＝note 側を消す。undefined＝触らない */
    reaction?: Omit<MandalaReaction, 'recordedAt' | 'x'> | null;
    /** 312: X 側の反応。null＝X 側を消す。undefined＝触らない */
    reactionX?: Omit<MandalaReactionX, 'recordedAt'> | null;
    research?: Record<string, unknown> | null;
  },
): Promise<UpdateCellMetaResult> {
  await ensureMandalaTables();
  const [current] = (await sql`
    SELECT id, chart_id, parent_cell_id, depth, position, title, body, meta, created_at, updated_at
    FROM mandala_cells WHERE id = ${cellId}::uuid AND user_id = ${userId}
  `) as CellRow[];
  if (!current) return { ok: false, reason: 'not_found' };
  const cur = toCell(current);
  const set: Record<string, unknown> = {};
  const remove: string[] = [];
  if (patch.tier !== undefined && patch.tier !== cur.meta.tier) set.tier = patch.tier;
  if (patch.reaction !== undefined || patch.reactionX !== undefined) {
    // 312: グループ単位のマージ（note 側と X 側を混ぜない・触らないグループは残す）。同一内容なら書かない（R-87 のサーバ側）
    const existing = parseReaction(cur.meta);
    const merged = mergeReaction(existing, { note: patch.reaction, x: patch.reactionX }, new Date().toISOString());
    const sameNote = patch.reaction === undefined || isSameReaction(existing && (MANDALA_HAS_NOTE(existing)) ? { views: existing.views, likes: existing.likes, shares: existing.shares, purchases: existing.purchases, memo: existing.memo } : null, patch.reaction);
    const sameX = patch.reactionX === undefined || isSameReactionX(existing?.x ?? null, patch.reactionX);
    if (!(sameNote && sameX)) {
      if (merged === null) {
        if (cur.meta.reaction !== undefined) remove.push('reaction');
      } else set.reaction = merged;
    }
  }
  // 311: 進行中の印（research）。null＝キーを消す。中身の同一判定はしない（startedAt を進める用途があるため）
  if (patch.research !== undefined) {
    if (patch.research === null) {
      if (cur.meta.research !== undefined) remove.push('research');
    } else set.research = patch.research;
  }
  if (Object.keys(set).length === 0 && remove.length === 0) return { ok: true, cell: cur, unchanged: true };
  const updated = (await sql`
    WITH u AS (
      UPDATE mandala_cells
      SET meta = (meta - ${remove}::text[]) || ${JSON.stringify(set)}::jsonb, updated_at = now()
      WHERE id = ${cellId}::uuid AND user_id = ${userId}
      RETURNING id, chart_id, parent_cell_id, depth, position, title, body, meta, created_at, updated_at
    ), bump AS (
      UPDATE mandala_charts SET updated_at = now() WHERE id IN (SELECT chart_id FROM u)
    )
    SELECT * FROM u
  `) as CellRow[];
  if (updated.length === 0) return { ok: false, reason: 'not_found' };
  return { ok: true, cell: toCell(updated[0]), unchanged: false };
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

// ============================================================
// 309: note記事の材料（リンク先の本文を所有者検証つきで取る／起こした記事の一覧）
// ============================================================

/**
 * 素材リンク（library／text_analysis／context）の本文を取る。鍵は `${scope}:${item_key}`。
 * 存在しない・他人の行は載らない（呼び出し側は「参照のみ」に落とす）。episode は 281 の体験ブロック経路で別に注入する
 */
export async function fetchMandalaLinkBodies(userId: string, links: readonly MandalaLinkResolved[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byScope = new Map<string, string[]>();
  for (const l of links) {
    if (!l.exists || l.scope === 'episode') continue;
    (byScope.get(l.scope) ?? byScope.set(l.scope, []).get(l.scope)!).push(String(l.item_key));
  }
  for (const [scope, keysRaw] of byScope) {
    const keys = [...new Set(keysRaw)];
    try {
      if (scope === 'library') {
        const rows = (await sql`SELECT id::text AS k, content FROM library WHERE user_id = ${userId} AND id::text = ANY(${keys})`) as { k: string; content: string | null }[];
        for (const r of rows) out.set(`library:${r.k}`, r.content ?? '');
      } else if (scope === 'text_analysis') {
        const rows = (await sql`SELECT id::text AS k, content FROM text_analysis_saves WHERE user_id = ${userId} AND id::text = ANY(${keys})`) as { k: string; content: string | null }[];
        for (const r of rows) out.set(`text_analysis:${r.k}`, r.content ?? '');
      } else if (scope === 'context') {
        const rows = (await sql`SELECT id::text AS k, context_text FROM context_saves WHERE user_id = ${userId} AND id::text = ANY(${keys})`) as { k: string; context_text: string | null }[];
        for (const r of rows) out.set(`context:${r.k}`, r.context_text ?? '');
      }
    } catch (e) {
      console.error('[mandala note] 素材本文の取得に失敗（参照のみに落とす）:', scope, e instanceof Error ? e.message : 'unknown');
    }
  }
  return out;
}

export interface MandalaArticleRow {
  id: string;
  title: string;
  mode: 'free_cell' | 'paid_chart';
  cellId: string | null;
  created_at: string;
}

/**
 * §3-4 「📝 n」「📝 記事: n件」の導出。記事の側の記録（library.metadata.mandala.chartId）から読む（mandala_*.meta には書かない・R-107）。
 * metadata は TEXT（JSON 文字列）なので、まず LIKE で絞ってから JSON として検証する
 */
export async function listArticlesFromChart(userId: string, chartId: string, type: 'note-article' | 'x-post' = 'note-article'): Promise<MandalaArticleRow[]> {
  const rows = (await sql`
    SELECT id, title, metadata, created_at FROM library
    WHERE user_id = ${userId} AND type = ${type} AND metadata LIKE ${'%"chartId":"' + chartId + '"%'}
    ORDER BY created_at DESC
    LIMIT 200
  `) as { id: string; title: string | null; metadata: string | null; created_at: string }[];
  const out: MandalaArticleRow[] = [];
  for (const r of rows) {
    let meta: Record<string, unknown> = {};
    try {
      meta = r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : {};
    } catch {
      continue;
    }
    const m = meta.mandala as Record<string, unknown> | undefined;
    if (!m || m.source !== 'mandala' || m.chartId !== chartId) continue;
    const mode = m.mode === 'paid_chart' ? 'paid_chart' : m.mode === 'free_cell' ? 'free_cell' : null;
    if (!mode) continue;
    out.push({ id: String(r.id), title: r.title ?? '', mode, cellId: typeof m.cellId === 'string' ? m.cellId : null, created_at: String(r.created_at) });
  }
  return out;
}

// ============================================================
// 311: リサーチ発注の進行中の印（meta.research）と、完了時の自動紐づけ
// ============================================================

export type StartResearchResult = { ok: true; cell: MandalaCell } | { ok: false; reason: 'not_found' | 'running' | 'empty' | 'no_theme'; message: string };

/**
 * §3-2 発注直後の印。同じマス・同じ経路の進行中があれば拒否（R-87 のサーバ側）。失敗・中断（閾値超過）は再発注できる。
 * jobId/index はバッチ経路のとき（テキスト分析は無し）。startedAt はサーバの現在時刻（表示は JST・R-86）
 */
export async function startResearch(
  userId: string,
  cellId: string,
  kind: MandalaResearchKind,
  extra: { jobId?: number; index?: number } = {},
): Promise<StartResearchResult> {
  await ensureMandalaTables();
  const [row] = (await sql`
    SELECT id, chart_id, parent_cell_id, depth, position, title, body, meta, created_at, updated_at
    FROM mandala_cells WHERE id = ${cellId}::uuid AND user_id = ${userId}
  `) as CellRow[];
  if (!row) return { ok: false, reason: 'not_found', message: 'マスが見つかりません' };
  const cur = toCell(row);
  // 311是正: 未記入（型の初期タイトルのまま・本文なし）と、テーマ（中央）の無いチャートは発注できない（画面と同じ判定・fail-closed）
  if (isPresetPlaceholder(cur)) return { ok: false, reason: 'empty', message: MANDALA_RESEARCH_REJECT_PLACEHOLDER };
  if (!isCellFilled(cur)) return { ok: false, reason: 'empty', message: 'タイトルも本文も空のマスは発注できません' };
  const [center] = (await sql`
    SELECT title FROM mandala_cells WHERE chart_id = ${cur.chart_id}::uuid AND depth = 1 AND position = ${MANDALA_CENTER}
  `) as { title: string }[];
  if (!(center?.title ?? '').trim()) return { ok: false, reason: 'no_theme', message: MANDALA_RESEARCH_REJECT_NO_THEME };
  const existing = parseResearchMeta(cur.meta);
  if (existing && existing.kind === kind && !canOrderResearch(cur.meta, Date.now())) {
    return { ok: false, reason: 'running', message: MANDALA_RESEARCH_REJECT_RUNNING };
  }
  const research: Record<string, unknown> = { kind, startedAt: new Date().toISOString(), ...(extra.jobId !== undefined ? { jobId: extra.jobId } : {}), ...(extra.index !== undefined ? { index: extra.index } : {}) };
  const res = await updateCellMeta(userId, cellId, { research });
  if (!res.ok) return { ok: false, reason: 'not_found', message: 'マスが見つかりません' };
  return { ok: true, cell: res.cell };
}

/** 失敗の記録（印は残す＝画面で分かる・再発注できる） */
export async function markResearchFailed(userId: string, cellId: string, reason: string): Promise<void> {
  const [row] = (await sql`SELECT meta FROM mandala_cells WHERE id = ${cellId}::uuid AND user_id = ${userId}`) as { meta: Record<string, unknown> | null }[];
  if (!row) return;
  const cur = parseResearchMeta(row.meta ?? {});
  const research: Record<string, unknown> = { ...(cur ?? { kind: 'deepresearch', startedAt: new Date().toISOString() }), failedAt: new Date().toISOString(), reason: reason.slice(0, 300) };
  await updateCellMeta(userId, cellId, { research });
}

export type LinkResearchResult = { ok: true; added: boolean } | { ok: false; skipped: 'cell_missing' | 'link_failed'; message: string };

/**
 * §3-3 完了フック。付帯情報（parseResearchRef で検証済み）があるときだけ動く（R-88）。
 * 302 の addLinks を**そのまま**通す（別の挿入経路を作らない・一意制約で重複しない）。
 * cell が無ければ（発注中に削除）紐づけをスキップして保存は残す（孤立リンクを作らない・§5）。
 * 紐づけに失敗しても保存は成功のまま（R-39）＝失敗は meta.research に残す
 */
export async function linkResearchResult(userId: string, ref: MandalaResearchRef, scope: 'library' | 'text_analysis' | 'context', itemKey: string): Promise<LinkResearchResult> {
  try {
    const res = await addLinks(userId, ref.cellId, [{ scope, item_key: itemKey }]);
    if (!res) return { ok: false, skipped: 'cell_missing', message: 'マスが見つからないため紐づけをスキップしました（保存は残ります）' };
    if (res.failed.length > 0) {
      await markResearchFailed(userId, ref.cellId, `紐づけに失敗: ${res.failed.join(',')}`).catch(() => {});
      return { ok: false, skipped: 'link_failed', message: `紐づけに失敗しました（${res.failed.join(',')}）` };
    }
    await updateCellMeta(userId, ref.cellId, { research: null }).catch(() => {});
    return { ok: true, added: res.added.length > 0 };
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    await markResearchFailed(userId, ref.cellId, `紐づけに失敗: ${message}`).catch(() => {});
    return { ok: false, skipped: 'link_failed', message };
  }
}

export interface MandalaXPostDbRow {
  id: string;
  title: string;
  mode: 'cell' | 'series';
  cellId: string | null;
  cellIds: string[];
  created_at: string;
}

/** 312 §3-4 「🐦 n」「🐦 投稿: n本」の導出（library type='x-post' の metadata.mandala から） */
export async function listXPostsFromChart(userId: string, chartId: string): Promise<MandalaXPostDbRow[]> {
  const rows = (await sql`
    SELECT id, title, metadata, created_at FROM library
    WHERE user_id = ${userId} AND type = 'x-post' AND metadata LIKE ${'%"chartId":"' + chartId + '"%'}
    ORDER BY created_at DESC
    LIMIT 300
  `) as { id: string; title: string | null; metadata: string | null; created_at: string }[];
  const out: MandalaXPostDbRow[] = [];
  for (const r of rows) {
    let meta: Record<string, unknown> = {};
    try {
      meta = r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : {};
    } catch {
      continue;
    }
    const m = meta.mandala as Record<string, unknown> | undefined;
    if (!m || m.source !== 'mandala' || m.chartId !== chartId) continue;
    const mode = m.mode === 'series' ? 'series' : m.mode === 'cell' ? 'cell' : null;
    if (!mode) continue;
    out.push({
      id: String(r.id),
      title: r.title ?? '',
      mode,
      cellId: typeof m.cellId === 'string' ? m.cellId : null,
      cellIds: Array.isArray(m.cellIds) ? m.cellIds.filter((x): x is string => typeof x === 'string') : [],
      created_at: String(r.created_at),
    });
  }
  return out;
}
