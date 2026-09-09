// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 311: 🔲 マンダラ — 未調査マスからのリサーチ／分析の発注（純関数・DB 非依存・R-108・決定的・R-74）
//
// 発注文はここで**決定的に**組み立てる（AI で作らない）。要素: テーマ（中央マス）／このマス（タイトル・本文）／
// 文脈（兄弟マスのタイトル・子マスなら親のタイトル）／経路ごとの定型1文。医療広告ガード等の既存規約は経路側が後勝ち（R-69）。
// 出力は経路の既存の入力型（バッチの topics 行／テキスト分析の handoff）に写す直前の中間形。写しは薄い1関数ずつ。
//
// 進行状況は mandala_cells.meta.research（R-113 キー単位）から導出する:
//   { kind, startedAt(ISO), jobId?, index?, failedAt?, reason? }
//   running＝failedAt が無く閾値内／failed＝failedAt あり／stale（中断）＝failedAt が無く閾値超過（284 と同じ 6 時間）
// 未調査＝記述があり（isCellWritten・型の未記入マスは除く・311是正）、リンク0件で、進行中でないマス（子マス含む）。まとめて発注は上限 8 件（R-101）。
// 311是正: 発注文の「テーマ」は中央マス。中央が空のチャートは単発・まとめとも発注を無効化して理由を出す（R-101）。
//   Kindle目次（307）・記事化（309）は現状どおり（無題）で進める＝この判定は発注だけに掛ける。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  MANDALA_CENTER,
  MANDALA_POSITION_LABELS,
  MANDALA_UNTITLED,
  cellDisplayTitle,
  centerCell,
  chartDisplayTitle,
  isCellFilled,
  isCellWritten,
  isPresetPlaceholder,
  type MandalaCell,
  type MandalaLinkCounts,
} from '@/lib/mandala-shared';

export type MandalaResearchKind = 'deepresearch' | 'text_analysis';
export const MANDALA_RESEARCH_KINDS: readonly MandalaResearchKind[] = ['deepresearch', 'text_analysis'];
export function isMandalaResearchKind(v: unknown): v is MandalaResearchKind {
  return v === 'deepresearch' || v === 'text_analysis';
}
export const MANDALA_RESEARCH_KIND_LABELS: Record<MandalaResearchKind, string> = {
  deepresearch: '🔭 ディープリサーチ',
  text_analysis: '📝 テキスト分析',
};

/** まとめて発注の上限（R-101・バッチの上限10より小さく） */
export const MANDALA_RESEARCH_BULK_MAX = 8;
/** 進行中が「中断」に変わる閾値（284 の中断ジョブと同じ 6 時間） */
export const MANDALA_RESEARCH_STALE_MS = 6 * 60 * 60 * 1000;
/** 発注文に載せるテーマ本文の冒頭の上限 */
export const MANDALA_RESEARCH_THEME_BODY_MAX = 300;
/** 発注文に載せる本文の上限（経路の既存値: DR のトピック／分析の入力はどちらも長文可。DB 保護の範囲） */
export const MANDALA_RESEARCH_BODY_MAX = 20_000;
export const MANDALA_RESEARCH_DR_MODES = ['quick', 'standard', 'deep'] as const;
export type MandalaResearchDrMode = (typeof MANDALA_RESEARCH_DR_MODES)[number];
export const MANDALA_RESEARCH_DR_MODE_DEFAULT: MandalaResearchDrMode = 'standard';

export const MANDALA_RESEARCH_REJECT_EMPTY = 'タイトルも本文も空のマスは発注できません';
export const MANDALA_RESEARCH_REJECT_NO_BODY = 'テキスト分析は本文があるマスだけ発注できます';
export const MANDALA_RESEARCH_REJECT_RUNNING = 'このマスは同じ経路で調査中です（完了か中断を待ってから再発注してください）';
/** 311是正: 型の未記入マス（初期タイトルのまま・本文なし）は発注できない */
export const MANDALA_RESEARCH_REJECT_PLACEHOLDER = 'まだ記述がありません（型の見出しのままで本文が空のマスは発注できません。タイトルを書き換えるか本文を書いてください）';
/** 311是正: 中央（テーマ）が空だと発注文のテーマが無い＝単発・まとめとも無効化（R-101） */
export const MANDALA_RESEARCH_REJECT_NO_THEME = '中央にテーマを書いてください（発注文の「テーマ」になります）';

/** 311是正: 発注の前提＝中央（テーマ）にタイトルがある */
export function hasResearchTheme(cells: readonly MandalaCell[]): boolean {
  return (centerCell(cells)?.title ?? '').trim() !== '';
}

/** 311是正: 単発の発注ボタンの可否（パネル）。未記入→理由、テーマ無し→理由。順序は固定（決定的・R-74） */
export function cellOrderState(cells: readonly MandalaCell[], cell: MandalaCell): { enabled: boolean; reason: string | null } {
  if (isPresetPlaceholder(cell)) return { enabled: false, reason: MANDALA_RESEARCH_REJECT_PLACEHOLDER };
  if (!isCellFilled(cell)) return { enabled: false, reason: MANDALA_RESEARCH_REJECT_EMPTY };
  if (!hasResearchTheme(cells)) return { enabled: false, reason: MANDALA_RESEARCH_REJECT_NO_THEME };
  return { enabled: true, reason: null };
}
export const MANDALA_RESEARCH_INSTRUCTION: Record<MandalaResearchKind, string> = {
  deepresearch: '上記のマスの内容を深く調べる（テーマと隣接マスの文脈を踏まえ、このマスの論点に絞る）',
  text_analysis: '上記の本文を分析する（テーマと隣接マスの文脈を踏まえる）',
};

export interface MandalaResearchOrder {
  ok: true;
  kind: MandalaResearchKind;
  chartId: string;
  cellId: string;
  /** 位置ラベル（子マスは「親 › 子」） */
  label: string;
  /** マスの見出し（空なら位置ラベルで補う） */
  title: string;
  theme: string;
  parentTitle: string | null;
  adjacentTitles: string[];
  /** 発注文（決定的・院長が直せる） */
  text: string;
}
export type MandalaResearchOrderResult = MandalaResearchOrder | { ok: false; cellId: string; reason: string };

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * 発注文を組み立てる。同じ入力→同じ出力（cells の並びに依存しない）
 */
export function buildResearchOrder(
  chart: { id: string; cells: readonly MandalaCell[] },
  cellId: string,
  kind: MandalaResearchKind,
): MandalaResearchOrderResult {
  const cell = chart.cells.find((c) => c.id === cellId);
  if (!cell) return { ok: false, cellId, reason: 'マスが見つかりません' };
  // 311是正: 未記入（型の初期タイトルのまま・本文なし）→ テーマ無し → 経路ごとの条件、の順（cellOrderState と同じ）
  if (isPresetPlaceholder(cell)) return { ok: false, cellId, reason: MANDALA_RESEARCH_REJECT_PLACEHOLDER };
  if (!isCellFilled(cell)) return { ok: false, cellId, reason: MANDALA_RESEARCH_REJECT_EMPTY };
  if (!hasResearchTheme(chart.cells)) return { ok: false, cellId, reason: MANDALA_RESEARCH_REJECT_NO_THEME };
  if (kind === 'text_analysis' && !cell.body.trim()) return { ok: false, cellId, reason: MANDALA_RESEARCH_REJECT_NO_BODY };
  const center = chart.cells.find((c) => c.depth === 1 && c.position === MANDALA_CENTER) ?? null;
  const theme = chartDisplayTitle(center?.title);
  const themeBody = center ? clip(center.body, MANDALA_RESEARCH_THEME_BODY_MAX) : '';
  const parent = cell.depth === 2 && cell.parent_cell_id ? chart.cells.find((c) => c.id === cell.parent_cell_id) ?? null : null;
  const siblings = chart.cells
    .filter((c) => c.id !== cell.id && c.depth === cell.depth && (c.parent_cell_id ?? null) === (cell.parent_cell_id ?? null) && c.position !== MANDALA_CENTER && isCellWritten(c))
    .sort((a, b) => a.position - b.position);
  const adjacentTitles = siblings.map((c) => cellDisplayTitle(c));
  const label = parent
    ? `${MANDALA_POSITION_LABELS[parent.position] ?? ''} › ${MANDALA_POSITION_LABELS[cell.position] ?? ''}`
    : MANDALA_POSITION_LABELS[cell.position] ?? String(cell.position);
  const title = cellDisplayTitle(cell);
  const lines: string[] = [];
  lines.push(`# テーマ: ${theme}`);
  if (themeBody) lines.push(themeBody);
  lines.push('', `# このマス（${label}）: ${title}`);
  if (cell.body.trim()) lines.push(clip(cell.body, MANDALA_RESEARCH_BODY_MAX));
  else lines.push('（本文なし。タイトルを論点として扱う）');
  const ctx: string[] = [];
  if (parent) ctx.push(`親マス: ${cellDisplayTitle(parent)}`);
  if (adjacentTitles.length > 0) ctx.push(`隣接: ${adjacentTitles.join('／')}`);
  if (ctx.length > 0) lines.push('', '# 文脈', ...ctx.map((c) => `- ${c}`));
  lines.push('', '# 指示', MANDALA_RESEARCH_INSTRUCTION[kind]);
  return {
    ok: true,
    kind,
    chartId: chart.id,
    cellId: cell.id,
    label,
    title,
    theme,
    parentTitle: parent ? cellDisplayTitle(parent) : null,
    adjacentTitles,
    text: lines.join('\n'),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 経路への写し（薄い1関数ずつ）
// ───────────────────────────────────────────────────────────────────────────

/** 付帯情報（バッチの topics 行／テキスト分析の保存／library.metadata.mandala に載る） */
export interface MandalaResearchRef {
  source: 'research';
  chartId: string;
  cellId: string;
  kind: MandalaResearchKind;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 付帯情報の検証（サーバ側・fail-closed）。不正なら null＝何もしない（R-88） */
export function parseResearchRef(v: unknown): MandalaResearchRef | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (r.source !== 'research' || typeof r.chartId !== 'string' || !UUID_RE.test(r.chartId) || typeof r.cellId !== 'string' || !UUID_RE.test(r.cellId)) return null;
  if (!isMandalaResearchKind(r.kind)) return null;
  return { source: 'research', chartId: r.chartId, cellId: r.cellId, kind: r.kind };
}

/** バッチの topics 行（既存の {topic, mode} に付帯情報 mandala をオプトインで足した形） */
export function researchOrderToBatchTopic(order: MandalaResearchOrder, mode: MandalaResearchDrMode, textOverride?: string) {
  const text = (textOverride ?? order.text).trim() || order.text;
  return { topic: text, mode, mandala: { source: 'research', chartId: order.chartId, cellId: order.cellId, kind: 'deepresearch' } as MandalaResearchRef };
}

/** バッチのジョブ名（決定的） */
export function researchBatchGroupName(theme: string, count: number): string {
  return `🔲 マンダラ『${theme || MANDALA_UNTITLED}』の調査（${count}件）`;
}

/** テキスト分析画面への handoff（sessionStorage・既存キーと同じ形＋mandala） */
export function researchOrderToTextAnalysisHandoff(order: MandalaResearchOrder, textOverride?: string) {
  const text = (textOverride ?? order.text).trim() || order.text;
  return { text, topic: order.title, mandala: { source: 'research', chartId: order.chartId, cellId: order.cellId, kind: 'text_analysis' } as MandalaResearchRef };
}

// ───────────────────────────────────────────────────────────────────────────
// 進行状況（meta.research）の導出
// ───────────────────────────────────────────────────────────────────────────

export interface MandalaResearchMeta {
  kind: MandalaResearchKind;
  startedAt: string;
  jobId?: number;
  index?: number;
  failedAt?: string;
  reason?: string;
}

export function parseResearchMeta(meta: Record<string, unknown> | null | undefined): MandalaResearchMeta | null {
  const r = meta?.research;
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  if (!isMandalaResearchKind(o.kind) || typeof o.startedAt !== 'string' || Number.isNaN(Date.parse(o.startedAt))) return null;
  return {
    kind: o.kind,
    startedAt: o.startedAt,
    jobId: typeof o.jobId === 'number' ? o.jobId : undefined,
    index: typeof o.index === 'number' ? o.index : undefined,
    failedAt: typeof o.failedAt === 'string' ? o.failedAt : undefined,
    reason: typeof o.reason === 'string' ? o.reason : undefined,
  };
}

export type MandalaResearchState = 'none' | 'running' | 'failed' | 'stale';

/** running／failed／stale（中断＝閾値超過・284 と同じ考え方） */
export function researchState(meta: Record<string, unknown> | null | undefined, nowMs: number): MandalaResearchState {
  const r = parseResearchMeta(meta);
  if (!r) return 'none';
  if (r.failedAt) return 'failed';
  return nowMs - Date.parse(r.startedAt) > MANDALA_RESEARCH_STALE_MS ? 'stale' : 'running';
}

export const MANDALA_RESEARCH_STATE_LABELS: Record<Exclude<MandalaResearchState, 'none'>, string> = {
  running: '🔍 調査中',
  failed: '🔍 失敗',
  stale: '🔍 中断',
};

/** 発注できるか（進行中は拒否。失敗・中断は再発注できる） */
export function canOrderResearch(meta: Record<string, unknown> | null | undefined, nowMs: number): boolean {
  return researchState(meta, nowMs) !== 'running';
}

/** 未調査＝記述があり（型の未記入マスは除く・311是正）、リンク0件で、進行中でない（子マス含む）。順序は depth→position（決定的） */
export function uncoveredCells(cells: readonly MandalaCell[], linkCounts: ReadonlyMap<string, MandalaLinkCounts>, nowMs: number): MandalaCell[] {
  return [...cells]
    .filter((c) => !(c.depth === 1 && c.position === MANDALA_CENTER))
    .filter((c) => isCellWritten(c) && (linkCounts.get(c.id)?.total ?? 0) === 0 && researchState(c.meta, nowMs) !== 'running')
    .sort((a, b) => (a.depth - b.depth) || (a.position - b.position) || (a.parent_cell_id ?? '').localeCompare(b.parent_cell_id ?? ''));
}

export interface MandalaResearchSummary {
  uncovered: number;
  inProgress: number;
  failed: number;
  stale: number;
}

/** 見出し「🔍 未調査 n／調査中 m」（決定的・R-74） */
export function researchSummary(cells: readonly MandalaCell[], linkCounts: ReadonlyMap<string, MandalaLinkCounts>, nowMs: number): MandalaResearchSummary {
  let inProgress = 0;
  let failed = 0;
  let stale = 0;
  for (const c of cells) {
    const s = researchState(c.meta, nowMs);
    if (s === 'running') inProgress += 1;
    else if (s === 'failed') failed += 1;
    else if (s === 'stale') stale += 1;
  }
  return { uncovered: uncoveredCells(cells, linkCounts, nowMs).length, inProgress, failed, stale };
}

/** まとめて発注の対象（上限で切らず、超過は理由で止める・R-101）。311是正: テーマ（中央）が無ければ件数に関わらず無効化＋理由 */
export function bulkOrderState(count: number, hasTheme: boolean = true): { enabled: boolean; reason: string | null } {
  if (!hasTheme) return { enabled: false, reason: MANDALA_RESEARCH_REJECT_NO_THEME };
  if (count === 0) return { enabled: false, reason: '未調査のマスがありません（記述があってリンク0件・進行中でないマスが対象。型の見出しのままのマスは含みません）' };
  if (count > MANDALA_RESEARCH_BULK_MAX) return { enabled: false, reason: `1回の発注は${MANDALA_RESEARCH_BULK_MAX}件までです（${count}件選択中。チェックを外して減らしてください）` };
  return { enabled: true, reason: null };
}
