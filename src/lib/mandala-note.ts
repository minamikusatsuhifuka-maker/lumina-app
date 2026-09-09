// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 309: 🔲 マンダラ → 📝 note記事（①ペルソナ経路）へ渡す材料の変換（純関数・DB 非依存・R-108・決定的・R-74）
//
// 無料（1マス）: 見出し＝マスのタイトル、骨子＝マスの本文（Markdown のまま）、素材＝そのマスの解決済みリンク（302）、
//   📔 は「体験メモ」として骨子に添える（生成側が体験を創作しないための根拠）。子マス（305）は節として順に添える。
//   本文が空（タイトルのみ）なら拒否（生成の根拠がない）。
// 有料（全体）: 中央＝読者の着地点（After）。周囲8を mandalaOutlineNested()（305）の順に tier で無料／有料に分ける。
//   tier の無いマスは「無料」扱い（型を使わないチャートでも有料記事を起こせるよう、有料は明示したマスだけ＝安全側）。
//   有料ラインの位置＝最初の tier='paid' の直前。無料比率（308 freeRatio）は目安として添える（強制しない）。
// 共通: 出どころ { source:'mandala', chartId, cellIds, mode } を必ず持つ。空のマスは含めず除外件数を返す。
//   削除済みリンクは渡さず件数で出す。プレビュー用と生成投入用は**同じ関数の出力**。
// 経路依存の写し（①ペルソナ経路の「参照資料」ブロック）は mandalaNoteToSource の1関数だけ。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  MANDALA_POSITION_LABELS,
  MANDALA_UNTITLED,
  cellDisplayTitle,
  cellTier,
  chartDisplayTitle,
  freeRatio,
  isCellFilled,
  scopeMetaOf,
  type FreeRatio,
  type MandalaCell,
  type MandalaLinkResolved,
  type MandalaOutlineEntry,
  type MandalaOutlineNode,
  type MandalaTier,
} from '@/lib/mandala-shared';

export type MandalaNoteMode = 'free_cell' | 'paid_chart';
export const MANDALA_NOTE_MODES: readonly MandalaNoteMode[] = ['free_cell', 'paid_chart'];
export function isMandalaNoteMode(v: unknown): v is MandalaNoteMode {
  return v === 'free_cell' || v === 'paid_chart';
}

/** 有料ラインの目印（noteの有料ラインは編集画面で手動設定＝位置の目印だけを出す） */
export const MANDALA_PAID_LINE_MARKER = '▼ 有料ライン（noteの編集画面でここに設定）▼';

export const MANDALA_NOTE_REJECT_EMPTY_BODY = 'このマスは本文が空で、素材（リンク）もありません（タイトルだけでは生成の根拠がありません）';
export const MANDALA_NOTE_REJECT_NO_CELLS = '埋まっているマスがありません（周囲8マスにタイトルか本文を入れてください）';
export const MANDALA_NOTE_PAID_DISABLED_REASON = '有料記事にできるのは「有料note記事の型」のチャート、または区分（無料／有料）を持つマスがあるチャートだけです';

export type MandalaNoteRefKind = 'material' | 'reference' | 'missing' | 'experience';

export interface MandalaNoteRef {
  scope: string;
  item_key: string;
  title: string;
  kind: MandalaNoteRefKind;
  /** 本文文字列で渡すときの本文（材料として渡せた分だけ・上限内）。無ければ空 */
  body: string;
  char_count: number | null;
}

export interface MandalaNoteSection {
  cellId: string;
  position: number;
  title: string;
  memo: string;
  refs: MandalaNoteRef[];
}

/** 有料モードの1項目（章）。tier の無いマスは 'free' */
export interface MandalaNoteEntry {
  cellId: string;
  position: number;
  title: string;
  memo: string;
  tier: MandalaTier;
  sections: MandalaNoteSection[];
  refs: MandalaNoteRef[];
}

export interface MandalaNoteCounts {
  /** 空のため除外したマス数 */
  excludedEmpty: number;
  /** 削除済みで渡さなかったリンク */
  missingLinks: number;
  /** 本文を渡した素材 */
  materials: number;
  /** 上限超過で参照のみ */
  referenceOnly: number;
  /** 📔 体験メモ */
  experiences: number;
}

export interface MandalaNoteSource {
  source: 'mandala';
  chartId: string;
  chartTitle: string;
  mode: MandalaNoteMode;
  /** 無料＝そのマス（と子）。有料＝含めた全マス（目次順） */
  cellIds: string[];
  /** 無料モードの主マス */
  cellId: string | null;
  /** 無料モードの主マスの位置ラベル（表示用） */
  cellLabel: string | null;
  cellTitle: string | null;
}

export type MandalaNoteResult =
  | {
      ok: true;
      mode: 'free_cell';
      title: string;
      memo: string;
      sections: MandalaNoteSection[];
      refs: MandalaNoteRef[];
      counts: MandalaNoteCounts;
      source: MandalaNoteSource;
    }
  | {
      ok: true;
      mode: 'paid_chart';
      /** 中央＝読者の着地点（After）。空なら（無題） */
      title: string;
      after: string;
      entries: MandalaNoteEntry[];
      /** 最初の paid の index（entries 内）。paid が無ければ null＝有料ラインを置かない */
      paidLineIndex: number | null;
      ratio: FreeRatio;
      counts: MandalaNoteCounts;
      source: MandalaNoteSource;
    }
  | { ok: false; mode: MandalaNoteMode; reason: string; counts: MandalaNoteCounts };

export interface MandalaNoteOptions {
  /** 素材の本文（scope:item_key → 本文）。サーバが所有者検証つきで取ってきたもの。無い鍵は参照のみ */
  bodies?: ReadonlyMap<string, string>;
  /** 本文で渡す素材の合計字数の上限（経路の既存値に従う） */
  materialCharLimit?: number;
}

export const MANDALA_NOTE_DEFAULT_CHAR_LIMIT = 60_000;

export function noteRefKey(scope: string, itemKey: string): string {
  return `${scope}:${itemKey}`;
}

/** 309是正①: 有効なリンク素材（📚🗂🧠📔・削除済みを除く）があるか。本文が空でも素材があれば「タイトルを切り口に素材だけで」起こせる */
export function hasUsableLinks(links: readonly MandalaLinkResolved[], cellId: string): boolean {
  return links.some((l) => l.cell_id === cellId && l.exists);
}

/** 記事の材料になるマスか＝タイトルか本文がある、または有効なリンク素材がある */
function isNoteSourceCell(cell: MandalaCell, links: readonly MandalaLinkResolved[]): boolean {
  return isCellFilled(cell) || hasUsableLinks(links, cell.id);
}

function emptyCounts(): MandalaNoteCounts {
  return { excludedEmpty: 0, missingLinks: 0, materials: 0, referenceOnly: 0, experiences: 0 };
}

/** 有料記事にできるか（§3-1: 型のチャート、または tier を持つマスが1つ以上） */
export function canMakePaidNote(chartMeta: Record<string, unknown> | null | undefined, cells: readonly MandalaCell[]): boolean {
  const preset = chartMeta?.preset;
  if (typeof preset === 'string' && preset) return true;
  return cells.some((c) => cellTier(c) !== null);
}

function makeRefs(
  links: readonly MandalaLinkResolved[],
  cellId: string,
  budget: { used: number; limit: number },
  bodies: ReadonlyMap<string, string> | undefined,
  counts: MandalaNoteCounts,
  taken: Set<string>,
): MandalaNoteRef[] {
  const rows = links.filter((l) => l.cell_id === cellId).sort((a, b) => a.id - b.id);
  return rows.map((l) => {
    const title = (l.title ?? '').trim();
    if (!l.exists) {
      counts.missingLinks += 1;
      return { scope: l.scope, item_key: l.item_key, title, kind: 'missing' as const, body: '', char_count: null };
    }
    if (l.scope === 'episode') {
      counts.experiences += 1;
      return { scope: l.scope, item_key: l.item_key, title, kind: 'experience' as const, body: '', char_count: l.char_count };
    }
    const key = noteRefKey(l.scope, l.item_key);
    const body = bodies?.get(key) ?? '';
    if (taken.has(key)) {
      return { scope: l.scope, item_key: l.item_key, title, kind: 'material' as const, body: '', char_count: l.char_count };
    }
    if (!body || budget.used + body.length > budget.limit) {
      counts.referenceOnly += 1;
      return { scope: l.scope, item_key: l.item_key, title, kind: 'reference' as const, body: '', char_count: l.char_count };
    }
    taken.add(key);
    budget.used += body.length;
    counts.materials += 1;
    return { scope: l.scope, item_key: l.item_key, title, kind: 'material' as const, body, char_count: l.char_count };
  });
}

function sectionsOf(
  node: MandalaOutlineNode,
  links: readonly MandalaLinkResolved[],
  budget: { used: number; limit: number },
  bodies: ReadonlyMap<string, string> | undefined,
  counts: MandalaNoteCounts,
  taken: Set<string>,
): MandalaNoteSection[] {
  const out: MandalaNoteSection[] = [];
  for (const child of node.children as MandalaOutlineEntry[]) {
    if (!isNoteSourceCell(child.cell, links)) {
      counts.excludedEmpty += 1;
      continue;
    }
    out.push({ cellId: child.cell.id, position: child.position, title: child.title, memo: child.cell.body, refs: makeRefs(links, child.cell.id, budget, bodies, counts, taken) });
  }
  return out;
}

/**
 * 無料（1マス）。中央マスも可。本文が空なら拒否。同じ入力→同じ出力
 */
export function mandalaNoteFree(
  chart: { id: string; cells: readonly MandalaCell[] },
  cellId: string,
  nested: readonly MandalaOutlineNode[],
  links: readonly MandalaLinkResolved[],
  options: MandalaNoteOptions = {},
): MandalaNoteResult {
  const counts = emptyCounts();
  const cell = chart.cells.find((c) => c.id === cellId) ?? null;
  if (!cell) return { ok: false, mode: 'free_cell', reason: 'マスが見つかりません', counts };
  // 309是正①: 本文が空でも有効なリンク素材があれば起こせる（タイトルを切り口に素材だけで＝①の DR 経路と同等）
  if (!cell.body.trim() && !hasUsableLinks(links, cell.id)) return { ok: false, mode: 'free_cell', reason: MANDALA_NOTE_REJECT_EMPTY_BODY, counts };
  const budget = { used: 0, limit: options.materialCharLimit ?? MANDALA_NOTE_DEFAULT_CHAR_LIMIT };
  const taken = new Set<string>();
  const refs = makeRefs(links, cell.id, budget, options.bodies, counts, taken);
  const node = nested.find((n) => n.cell.id === cell.id) ?? null;
  const sections = node ? sectionsOf(node, links, budget, options.bodies, counts, taken) : [];
  const center = chart.cells.find((c) => c.depth === 1 && c.position === 4) ?? null;
  const label = cell.depth === 2 && cell.parent_cell_id
    ? `${MANDALA_POSITION_LABELS[chart.cells.find((c) => c.id === cell.parent_cell_id)?.position ?? 0] ?? ''} › ${MANDALA_POSITION_LABELS[cell.position] ?? ''}`
    : MANDALA_POSITION_LABELS[cell.position] ?? String(cell.position);
  return {
    ok: true,
    mode: 'free_cell',
    title: cellDisplayTitle(cell),
    memo: cell.body,
    sections,
    refs,
    counts,
    source: {
      source: 'mandala',
      chartId: chart.id,
      chartTitle: chartDisplayTitle(center?.title),
      mode: 'free_cell',
      cellIds: [cell.id, ...sections.map((s) => s.cellId)],
      cellId: cell.id,
      cellLabel: label,
      cellTitle: cellDisplayTitle(cell),
    },
  };
}

/**
 * 有料（全体）。tier の無いマスは 'free'。有料ラインは最初の paid の直前。空のマスは除外
 */
export function mandalaNotePaid(
  chart: { id: string; meta?: Record<string, unknown> | null; cells: readonly MandalaCell[] },
  nested: readonly MandalaOutlineNode[],
  links: readonly MandalaLinkResolved[],
  options: MandalaNoteOptions = {},
): MandalaNoteResult {
  const counts = emptyCounts();
  const budget = { used: 0, limit: options.materialCharLimit ?? MANDALA_NOTE_DEFAULT_CHAR_LIMIT };
  const taken = new Set<string>();
  const entries: MandalaNoteEntry[] = [];
  for (const node of nested) {
    if (!isNoteSourceCell(node.cell, links)) {
      counts.excludedEmpty += 1 + node.children.filter((c) => !isNoteSourceCell(c.cell, links)).length;
      continue;
    }
    entries.push({
      cellId: node.cell.id,
      position: node.position,
      title: node.title,
      memo: node.cell.body,
      tier: cellTier(node.cell) ?? 'free',
      sections: sectionsOf(node, links, budget, options.bodies, counts, taken),
      refs: makeRefs(links, node.cell.id, budget, options.bodies, counts, taken),
    });
  }
  if (entries.length === 0) return { ok: false, mode: 'paid_chart', reason: MANDALA_NOTE_REJECT_NO_CELLS, counts };
  const firstPaid = entries.findIndex((e) => e.tier === 'paid');
  const center = chart.cells.find((c) => c.depth === 1 && c.position === 4) ?? null;
  return {
    ok: true,
    mode: 'paid_chart',
    title: chartDisplayTitle(center?.title),
    after: center?.body ?? '',
    entries,
    paidLineIndex: firstPaid >= 0 ? firstPaid : null,
    ratio: freeRatio(chart.cells),
    counts,
    source: {
      source: 'mandala',
      chartId: chart.id,
      chartTitle: chartDisplayTitle(center?.title),
      mode: 'paid_chart',
      cellIds: entries.flatMap((e) => [e.cellId, ...e.sections.map((s) => s.cellId)]),
      cellId: null,
      cellLabel: null,
      cellTitle: null,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// ①ペルソナ経路への写し（経路依存はここ1関数）: 「参照資料」ブロックのタイトルと本文
// ───────────────────────────────────────────────────────────────────────────

function refLines(refs: readonly MandalaNoteRef[]): string {
  const lines: string[] = [];
  for (const r of refs) {
    if (r.kind === 'missing') continue;
    const meta = scopeMetaOf(r.scope);
    if (r.kind === 'experience') lines.push(`- 体験メモ（📔 ${meta.label}）: ${r.title || MANDALA_UNTITLED}`);
    else if (r.kind === 'reference') lines.push(`- 参照（本文は渡していない）: ${r.title || MANDALA_UNTITLED}（${meta.icon} ${meta.label}）`);
    else lines.push(`- 素材: ${r.title || MANDALA_UNTITLED}（${meta.icon} ${meta.label}）`);
  }
  return lines.join('\n');
}

function materialBlocks(refs: readonly MandalaNoteRef[]): string {
  return refs
    .filter((r) => r.kind === 'material' && r.body)
    .map((r) => `### 素材: ${r.title || MANDALA_UNTITLED}\n${r.body}`)
    .join('\n\n');
}

export interface MandalaNoteSourceText {
  title: string;
  content: string;
  /** 有料モードのとき、有料ライン直前の項目タイトル（プロンプトの位置指定に使う） */
  paidLineBefore: string | null;
  /** 有料モードのとき、無料比率の目安文（強制しない） */
  ratioHint: string | null;
}

export function mandalaNoteToSource(result: MandalaNoteResult): MandalaNoteSourceText | null {
  if (!result.ok) return null;
  if (result.mode === 'free_cell') {
    const parts: string[] = [`## ${result.title}`, result.memo.trim() ? result.memo : '（骨子なし。タイトルを切り口に、素材・体験メモにある事実だけで書く）'];
    const r = refLines(result.refs);
    if (r) parts.push(`素材・体験メモ:\n${r}`);
    for (const s of result.sections) {
      parts.push(`### ${s.title}`);
      if (s.memo.trim()) parts.push(s.memo);
      const sr = refLines(s.refs);
      if (sr) parts.push(`素材・体験メモ:\n${sr}`);
    }
    const mats = materialBlocks([...result.refs, ...result.sections.flatMap((s) => s.refs)]);
    if (mats) parts.push(`## 素材の本文\n\n${mats}`);
    return { title: result.title, content: parts.join('\n\n'), paidLineBefore: null, ratioHint: null };
  }
  const parts: string[] = [`## 読者の着地点（After）`, result.after.trim() || '（未記入）'];
  result.entries.forEach((e, i) => {
    if (result.paidLineIndex === i) parts.push(MANDALA_PAID_LINE_MARKER);
    parts.push(`## ${e.title}【${e.tier === 'paid' ? '有料' : '無料'}】`);
    if (e.memo.trim()) parts.push(e.memo);
    const r = refLines(e.refs);
    if (r) parts.push(`素材・体験メモ:\n${r}`);
    for (const s of e.sections) {
      parts.push(`### ${s.title}`);
      if (s.memo.trim()) parts.push(s.memo);
      const sr = refLines(s.refs);
      if (sr) parts.push(`素材・体験メモ:\n${sr}`);
    }
  });
  const mats = materialBlocks(result.entries.flatMap((e) => [...e.refs, ...e.sections.flatMap((s) => s.refs)]));
  if (mats) parts.push(`## 素材の本文\n\n${mats}`);
  const before = result.paidLineIndex !== null ? result.entries[result.paidLineIndex].title : null;
  const ratioHint = result.ratio.ratio !== null ? `骨子の無料側の本文比率は ${Math.round(result.ratio.ratio * 100)}%（目安 60〜70%・強制しない）` : null;
  return { title: result.title, content: parts.join('\n\n'), paidLineBefore: before, ratioHint };
}

/** 有料モードの生成物に目印が無ければ、最初の paid 項目のタイトルを含む大見出しの直前に置く（決定的）。見つからなければ null */
export function ensurePaidLineMarker(body: string, firstPaidTitle: string | null): { body: string; inserted: boolean; missing: boolean } {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const idxs = lines.map((l, i) => (l.trim() === MANDALA_PAID_LINE_MARKER ? i : -1)).filter((i) => i >= 0);
  if (idxs.length >= 1) {
    // 2本以上は最初だけ残す
    const keep = idxs[0];
    const out = lines.filter((l, i) => i === keep || l.trim() !== MANDALA_PAID_LINE_MARKER);
    return { body: out.join('\n'), inserted: false, missing: false };
  }
  if (!firstPaidTitle) return { body, inserted: false, missing: false };
  const needle = firstPaidTitle.trim().slice(0, 12);
  const at = needle ? lines.findIndex((l) => /^##\s/.test(l) && l.includes(needle)) : -1;
  if (at < 0) return { body, inserted: false, missing: true };
  lines.splice(at, 0, MANDALA_PAID_LINE_MARKER, '');
  return { body: lines.join('\n'), inserted: true, missing: false };
}

// ───────────────────────────────────────────────────────────────────────────
// 出どころ（library.metadata.mandala）の読み出し・表示
// ───────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MandalaArticleSource extends MandalaNoteSource {
  generatedAt: string;
}

export function parseMandalaArticleSource(metadata: unknown): MandalaArticleSource | null {
  let meta: unknown = metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      return null;
    }
  }
  if (!meta || typeof meta !== 'object') return null;
  const m = (meta as { mandala?: unknown }).mandala;
  if (!m || typeof m !== 'object') return null;
  const r = m as Record<string, unknown>;
  if (r.source !== 'mandala' || typeof r.chartId !== 'string' || !UUID_RE.test(r.chartId) || !isMandalaNoteMode(r.mode)) return null;
  return {
    source: 'mandala',
    chartId: r.chartId,
    chartTitle: typeof r.chartTitle === 'string' ? r.chartTitle : '',
    mode: r.mode,
    cellIds: Array.isArray(r.cellIds) ? r.cellIds.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)) : [],
    cellId: typeof r.cellId === 'string' && UUID_RE.test(r.cellId) ? r.cellId : null,
    cellLabel: typeof r.cellLabel === 'string' ? r.cellLabel : null,
    cellTitle: typeof r.cellTitle === 'string' ? r.cellTitle : null,
    generatedAt: typeof r.generatedAt === 'string' ? r.generatedAt : '',
  };
}

/** 記事側の文言（§3-4）。無料＝「マンダラ『○○』の『左上: ○○』から」／有料＝「『○○』全体から」 */
export function mandalaArticleOriginLabel(src: Pick<MandalaArticleSource, 'chartTitle' | 'mode' | 'cellLabel' | 'cellTitle'>): string {
  const chart = chartDisplayTitle(src.chartTitle);
  if (src.mode === 'paid_chart') return `マンダラ『${chart}』全体から`;
  return `マンダラ『${chart}』の『${src.cellLabel ?? '?'}: ${src.cellTitle || MANDALA_UNTITLED}』から`;
}

/** マス側「📝 n」・見出し「📝 記事: n件」（§3-4）。記録から導出 */
export interface MandalaArticleRef {
  id: string;
  title: string;
  mode: MandalaNoteMode;
  cellId: string | null;
  created_at: string;
}

export function articleCountsByCell(articles: readonly MandalaArticleRef[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of articles) {
    if (!a.cellId) continue;
    m.set(a.cellId, (m.get(a.cellId) ?? 0) + 1);
  }
  return m;
}

export function mandalaArticlesLabel(n: number): string {
  return `📝 記事: ${n}件`;
}
