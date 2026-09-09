// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 312: 🔲 マンダラ → 🐦 X投稿（1マス＝投稿群／チャート＝シリーズ）の材料の変換（純関数・DB 非依存・R-108・決定的・R-74）
//
// - マス1つ→投稿群: 気づき＝マスのタイトル・本文（Markdown のまま）、素材＝解決済みリンク（302・本文は上限内で添える）、
//   📔 は「体験メモ」。本数の既定 3（1〜5・C-01: 1投稿1気づき）。セルフリプライ枠＝本文・素材に含まれる URL の候補（無ければ空）
// - チャート→シリーズ: mandalaOutlineNested()（305）の順で、埋まっている周囲マス 1マス＝1投稿（最大8）。子マスは含めない
//   （1投稿1気づきの単位は第1階層のマス。子は節＝1投稿に畳むと気づきが混ざる）。中央＝シリーズの主題（1本目の前置きに使ってよい）
// - 共通: 出どころ { source:'mandala', chartId, cellIds, mode:'cell'|'series' }。空のマスは含めず除外件数。
//   プレビューと生成投入が同じ関数の出力。③の既存入力型（article:{title,content}）への写しは mandalaXToArticle の1関数
// - 二段目のガード（コード側・決定的）: moveUrlsToReply＝本文の URL をセルフリプライ欄へ移す。文字数は X_HARD_LIMIT（既存）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  MANDALA_CENTER,
  MANDALA_POSITION_LABELS,
  MANDALA_UNTITLED,
  cellDisplayTitle,
  chartDisplayTitle,
  isCellFilled,
  scopeMetaOf,
  type MandalaCell,
  type MandalaLinkResolved,
  type MandalaOutlineNode,
} from '@/lib/mandala-shared';

export type MandalaXMode = 'cell' | 'series';
export function isMandalaXMode(v: unknown): v is MandalaXMode {
  return v === 'cell' || v === 'series';
}

export const MANDALA_X_COUNT_DEFAULT = 3;
export const MANDALA_X_COUNT_MIN = 1;
export const MANDALA_X_COUNT_MAX = 5;
export const MANDALA_X_SERIES_MAX = 8;
export const MANDALA_X_SERIES_MIN = 2;
/** 素材の本文を渡す合計の上限（③ の MAX_SOURCE_CHARS=20,000 に収める。気づき本文の分を残す） */
export const MANDALA_X_MATERIAL_CHAR_LIMIT = 12_000;

export const MANDALA_X_REJECT_EMPTY = 'タイトルも本文も空のマスは投稿にできません';
export const MANDALA_X_SERIES_DISABLED_REASON = `Xシリーズにできるのは、埋まっている周囲マスが${MANDALA_X_SERIES_MIN}つ以上あるチャートだけです`;

export function normalizeXCount(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isInteger(n)) return MANDALA_X_COUNT_DEFAULT;
  return Math.min(MANDALA_X_COUNT_MAX, Math.max(MANDALA_X_COUNT_MIN, n));
}

export type MandalaXRefKind = 'material' | 'reference' | 'missing' | 'experience';
export interface MandalaXRef {
  scope: string;
  item_key: string;
  title: string;
  kind: MandalaXRefKind;
  body: string;
}

export interface MandalaXPostSource {
  cellId: string;
  position: number;
  label: string;
  title: string;
  memo: string;
  refs: MandalaXRef[];
  /** セルフリプライ欄の候補 URL（本文・素材の本文にある https?://…。重複なし・順序保持） */
  replyUrls: string[];
}

export interface MandalaXCounts {
  excludedEmpty: number;
  missingLinks: number;
  materials: number;
  referenceOnly: number;
  experiences: number;
}

export interface MandalaXSource {
  source: 'mandala';
  chartId: string;
  chartTitle: string;
  mode: MandalaXMode;
  cellIds: string[];
  /** cell モードの主マス（series は null） */
  cellId: string | null;
  cellLabel: string | null;
  cellTitle: string | null;
  /** cell モードの本数（series は投稿数） */
  count: number;
}

export type MandalaXResult =
  | { ok: true; mode: 'cell'; theme: string; post: MandalaXPostSource; count: number; counts: MandalaXCounts; source: MandalaXSource }
  | { ok: true; mode: 'series'; theme: string; themeBody: string; posts: MandalaXPostSource[]; counts: MandalaXCounts; source: MandalaXSource }
  | { ok: false; mode: MandalaXMode; reason: string; counts: MandalaXCounts };

export interface MandalaXOptions {
  bodies?: ReadonlyMap<string, string>;
  materialCharLimit?: number;
  count?: unknown;
}

const URL_RE = /https?:\/\/[^\s<>()「」『』（）]+/g;

/** 本文中の URL を列挙（重複なし・順序保持） */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? '').match(URL_RE) ?? []) {
    const u = m.replace(/[.,、。」』）)]+$/, '');
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

/**
 * 二段目のガード（コード側・冪等）: 本文の URL をセルフリプライ欄へ移す。URL の行が空になれば行ごと落とし、連続する空行は1つに
 */
export function moveUrlsToReply(text: string): { body: string; urls: string[] } {
  const urls = extractUrls(text);
  if (urls.length === 0) return { body: String(text ?? ''), urls: [] };
  const body = String(text ?? '')
    .replace(URL_RE, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { body, urls };
}

function emptyCounts(): MandalaXCounts {
  return { excludedEmpty: 0, missingLinks: 0, materials: 0, referenceOnly: 0, experiences: 0 };
}

function refsOf(links: readonly MandalaLinkResolved[], cellId: string, bodies: ReadonlyMap<string, string> | undefined, budget: { used: number; limit: number }, counts: MandalaXCounts, taken: Set<string>): MandalaXRef[] {
  return links
    .filter((l) => l.cell_id === cellId)
    .sort((a, b) => a.id - b.id)
    .map((l) => {
      const title = (l.title ?? '').trim();
      if (!l.exists) {
        counts.missingLinks += 1;
        return { scope: l.scope, item_key: l.item_key, title, kind: 'missing' as const, body: '' };
      }
      if (l.scope === 'episode') {
        counts.experiences += 1;
        return { scope: l.scope, item_key: l.item_key, title, kind: 'experience' as const, body: '' };
      }
      const key = `${l.scope}:${l.item_key}`;
      const body = bodies?.get(key) ?? '';
      if (taken.has(key)) return { scope: l.scope, item_key: l.item_key, title, kind: 'material' as const, body: '' };
      if (!body || budget.used + body.length > budget.limit) {
        counts.referenceOnly += 1;
        return { scope: l.scope, item_key: l.item_key, title, kind: 'reference' as const, body: '' };
      }
      taken.add(key);
      budget.used += body.length;
      counts.materials += 1;
      return { scope: l.scope, item_key: l.item_key, title, kind: 'material' as const, body };
    });
}

function postSourceOf(cell: MandalaCell, chart: { cells: readonly MandalaCell[] }, refs: MandalaXRef[]): MandalaXPostSource {
  const parent = cell.depth === 2 && cell.parent_cell_id ? chart.cells.find((c) => c.id === cell.parent_cell_id) ?? null : null;
  const label = parent ? `${MANDALA_POSITION_LABELS[parent.position] ?? ''} › ${MANDALA_POSITION_LABELS[cell.position] ?? ''}` : MANDALA_POSITION_LABELS[cell.position] ?? String(cell.position);
  const replyUrls = extractUrls([cell.body, ...refs.map((r) => r.body)].join('\n'));
  return { cellId: cell.id, position: cell.position, label, title: cellDisplayTitle(cell), memo: cell.body, refs, replyUrls };
}

/** マス1つ→投稿群（本数は 1〜5・既定 3）。中央マスも可。空は拒否 */
export function mandalaXCell(chart: { id: string; cells: readonly MandalaCell[] }, cellId: string, links: readonly MandalaLinkResolved[], options: MandalaXOptions = {}): MandalaXResult {
  const counts = emptyCounts();
  const cell = chart.cells.find((c) => c.id === cellId);
  if (!cell) return { ok: false, mode: 'cell', reason: 'マスが見つかりません', counts };
  if (!isCellFilled(cell)) return { ok: false, mode: 'cell', reason: MANDALA_X_REJECT_EMPTY, counts };
  const budget = { used: 0, limit: options.materialCharLimit ?? MANDALA_X_MATERIAL_CHAR_LIMIT };
  const refs = refsOf(links, cell.id, options.bodies, budget, counts, new Set());
  const center = chart.cells.find((c) => c.depth === 1 && c.position === MANDALA_CENTER) ?? null;
  const post = postSourceOf(cell, chart, refs);
  const count = normalizeXCount(options.count);
  return {
    ok: true,
    mode: 'cell',
    theme: chartDisplayTitle(center?.title),
    post,
    count,
    counts,
    source: { source: 'mandala', chartId: chart.id, chartTitle: chartDisplayTitle(center?.title), mode: 'cell', cellIds: [cell.id], cellId: cell.id, cellLabel: post.label, cellTitle: post.title, count },
  };
}

/** チャート→シリーズ（周囲8の埋まっているマス・目次順・最大8・子マス無し）。2マス未満は拒否 */
export function mandalaXSeries(chart: { id: string; cells: readonly MandalaCell[] }, nested: readonly MandalaOutlineNode[], links: readonly MandalaLinkResolved[], options: MandalaXOptions = {}): MandalaXResult {
  const counts = emptyCounts();
  const budget = { used: 0, limit: options.materialCharLimit ?? MANDALA_X_MATERIAL_CHAR_LIMIT };
  const taken = new Set<string>();
  const posts: MandalaXPostSource[] = [];
  for (const node of nested) {
    if (posts.length >= MANDALA_X_SERIES_MAX) break;
    if (!isCellFilled(node.cell)) {
      counts.excludedEmpty += 1;
      continue;
    }
    posts.push(postSourceOf(node.cell, chart, refsOf(links, node.cell.id, options.bodies, budget, counts, taken)));
  }
  if (posts.length < MANDALA_X_SERIES_MIN) return { ok: false, mode: 'series', reason: MANDALA_X_SERIES_DISABLED_REASON, counts };
  const center = chart.cells.find((c) => c.depth === 1 && c.position === MANDALA_CENTER) ?? null;
  return {
    ok: true,
    mode: 'series',
    theme: chartDisplayTitle(center?.title),
    themeBody: center?.body ?? '',
    posts,
    counts,
    source: { source: 'mandala', chartId: chart.id, chartTitle: chartDisplayTitle(center?.title), mode: 'series', cellIds: posts.map((p) => p.cellId), cellId: null, cellLabel: null, cellTitle: null, count: posts.length },
  };
}

/** シリーズにできるか（§3-1: 埋まっている周囲マスが2つ以上） */
export function canMakeXSeries(cells: readonly MandalaCell[]): boolean {
  return cells.filter((c) => c.depth === 1 && c.position !== MANDALA_CENTER && isCellFilled(c)).length >= MANDALA_X_SERIES_MIN;
}

// ───────────────────────────────────────────────────────────────────────────
// ③ X投稿連動への写し（薄い1関数）: article:{title, content}
// ───────────────────────────────────────────────────────────────────────────

function refLines(refs: readonly MandalaXRef[]): string {
  return refs
    .filter((r) => r.kind !== 'missing')
    .map((r) => {
      const meta = scopeMetaOf(r.scope);
      if (r.kind === 'experience') return `- 体験メモ（📔 ${meta.label}）: ${r.title || MANDALA_UNTITLED}`;
      if (r.kind === 'reference') return `- 参照（本文は渡していない）: ${r.title || MANDALA_UNTITLED}`;
      return `- 素材: ${r.title || MANDALA_UNTITLED}（${meta.icon} ${meta.label}）`;
    })
    .join('\n');
}

export interface MandalaXArticle {
  title: string;
  content: string;
}

/** cell モード＝主マス、series モード＝index の投稿（1マス）を ③ の article に写す */
export function mandalaXToArticle(result: MandalaXResult, index = 0): MandalaXArticle | null {
  if (!result.ok) return null;
  const post = result.mode === 'cell' ? result.post : result.posts[index];
  if (!post) return null;
  const parts: string[] = [`# テーマ: ${result.theme}`];
  if (result.mode === 'series') {
    if (result.themeBody.trim()) parts.push(result.themeBody.trim().slice(0, 300));
    parts.push(`（シリーズ ${index + 1}/${result.posts.length} 本目・1マス＝1投稿）`);
  }
  parts.push('', `## 気づき（${post.label}）: ${post.title}`, post.memo.trim() ? post.memo : '（本文なし。タイトルを気づきとして扱う）');
  const lines = refLines(post.refs);
  if (lines) parts.push('', '素材・体験メモ:', lines);
  const mats = post.refs.filter((r) => r.kind === 'material' && r.body).map((r) => `### 素材: ${r.title || MANDALA_UNTITLED}\n${r.body}`);
  if (mats.length > 0) parts.push('', '## 素材の本文', '', ...mats);
  return { title: post.title, content: parts.join('\n') };
}

// ───────────────────────────────────────────────────────────────────────────
// 出どころ（library.metadata.mandala・type='x-post'）
// ───────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MandalaXRef2 {
  source: 'mandala';
  chartId: string;
  cellId: string | null;
  cellIds: string[];
  mode: MandalaXMode;
  chartTitle: string;
  cellLabel: string | null;
  cellTitle: string | null;
  count: number;
  /** series: 何本目 */
  index?: number;
}

/** 生成／保存に渡す出どころの検証（fail-closed） */
export function parseMandalaXRef(v: unknown): MandalaXRef2 | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (r.source !== 'mandala' || typeof r.chartId !== 'string' || !UUID_RE.test(r.chartId) || !isMandalaXMode(r.mode)) return null;
  const cellId = typeof r.cellId === 'string' && UUID_RE.test(r.cellId) ? r.cellId : null;
  if (r.mode === 'cell' && !cellId) return null;
  return {
    source: 'mandala',
    chartId: r.chartId,
    cellId,
    cellIds: Array.isArray(r.cellIds) ? r.cellIds.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)) : cellId ? [cellId] : [],
    mode: r.mode,
    chartTitle: typeof r.chartTitle === 'string' ? r.chartTitle : '',
    cellLabel: typeof r.cellLabel === 'string' ? r.cellLabel : null,
    cellTitle: typeof r.cellTitle === 'string' ? r.cellTitle : null,
    count: normalizeXCount(r.count) === MANDALA_X_COUNT_DEFAULT && typeof r.count !== 'number' ? MANDALA_X_COUNT_DEFAULT : Number(r.count) || MANDALA_X_COUNT_DEFAULT,
    index: typeof r.index === 'number' && Number.isInteger(r.index) && r.index >= 0 ? r.index : undefined,
  };
}

/** 投稿側の文言（§3-4）: 「マンダラ『○○』の『左上: ○○』から」／「マンダラ『○○』のシリーズ n本」 */
export function mandalaXOriginLabel(src: Pick<MandalaXRef2, 'chartTitle' | 'mode' | 'cellLabel' | 'cellTitle' | 'count' | 'index'>): string {
  const chart = chartDisplayTitle(src.chartTitle);
  if (src.mode === 'series') return `マンダラ『${chart}』のシリーズ ${src.count}本${typeof src.index === 'number' ? `（${src.index + 1}本目）` : ''}`;
  return `マンダラ『${chart}』の『${src.cellLabel ?? '?'}: ${src.cellTitle || MANDALA_UNTITLED}』から`;
}

export interface MandalaXPostRow {
  id: string;
  title: string;
  mode: MandalaXMode;
  cellId: string | null;
  cellIds: string[];
  created_at: string;
}

/** マス側「🐦 n」（cell モードは主マス、series は各投稿のマス） */
export function xPostCountsByCell(rows: readonly MandalaXPostRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const ids = r.mode === 'cell' ? (r.cellId ? [r.cellId] : []) : r.cellIds;
    for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

export function mandalaXPostsLabel(n: number): string {
  return `🐦 投稿: ${n}本`;
}

/** プロンプト追記（③ のガード優先ブロックの**後ろ**に置く・R-69）。経路の医療広告ガードは既存のものが後勝ち */
export function mandalaXPromptBlock(mode: MandalaXMode, count: number, seriesIndex?: number, seriesTotal?: number): string {
  const lines = [
    '# 骨子（マンダラ）からの投稿（厳守）',
    '- 参照資料は著者本人の「気づき」と、著者が集めた素材・体験メモである。**気づき・素材・体験メモにある事実の範囲で書く。体験・実績・数字を補わない。不確かなら書かない**',
    '- **1投稿1気づき**（C-01）。1つの投稿で複数の論点を扱わない',
    '- **本文に外部リンク（URL）を置かない**。リンクは1つ目のリプライ（セルフリプライ欄）へ',
  ];
  if (mode === 'cell') lines.push(`- thread の${count}ポストは「連番の続き物」ではなく、それぞれが単体で完結する${count}本の投稿にする（同じ気づきを別の切り口で）`);
  else lines.push(`- これはシリーズ ${(seriesIndex ?? 0) + 1}/${seriesTotal ?? 1} 本目。single はこの1マスの気づきだけで完結させる（1本目ならテーマの前置きを1文入れてよい）`);
  return lines.join('\n');
}
