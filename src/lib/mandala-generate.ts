// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 316: 記事→マンダラ生成（要点と関連性を 9／81 マスに展開）の純ロジック（DB 非依存・決定的・R-74／R-108）
//
// 位置づけ（§1-2）: 301〜312 のマンダラは院長の思考の骨格（手書き）。本便は「記事を読むためのマンダラ」（AI 生成）。
// 同じ画面・同じモデルに載せるが、AI 由来を常に見えるようにし混ざらないようにする（meta.generated／cell.meta.origin・R-90）。
// 守ること（§1-3）: 記事にある内容だけ。要点・小項目の evidence（記事からの引用）が本文に実在しない項目は捨てて件数を報告する
//   （プロンプト＋コード側の根拠検証の二段構え）。上限超えは切らずに捨てる（R-101）。要点が2件未満なら生成失敗（fail-closed）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { GEMINI_TEXT_MODEL } from '@/lib/ai-models';
import { MANDALA_CENTER, MANDALA_OUTLINE_POSITIONS, MANDALA_POSITION_LABELS, type MandalaCell } from '@/lib/mandala-shared';
import { COMPARE_PROMPT_OVERHEAD_CHARS, costOf } from '@/lib/model-pricing';

export type MandalaGenerateMode = '9' | '81';
export const MANDALA_GENERATE_MODES: readonly MandalaGenerateMode[] = ['9', '81'];
export function isMandalaGenerateMode(v: unknown): v is MandalaGenerateMode {
  return v === '9' || v === '81';
}
/** 既定の選び方（§3-1）: 本文 3,000 字以上なら 81・未満なら 9 */
export const MANDALA_GENERATE_81_MIN_CHARS = 3000;
export function defaultGenerateMode(chars: number): MandalaGenerateMode {
  return chars >= MANDALA_GENERATE_81_MIN_CHARS ? '81' : '9';
}

// 文字数上限（§3-2）。超えたものは切らずに捨てる
export const GEN_LIMITS = {
  centerTitle: 20,
  centerBodySentences: 5,
  pointTitle: 15,
  pointBodyMinSentences: 3,
  pointBodyMaxSentences: 6,
  evidence: 60,
  relationLabel: 15,
  relationsMax: 3,
  itemTitle: 15,
  itemBodyMinSentences: 2,
  itemBodyMaxSentences: 4,
  itemsMax: 8,
  pointsMin: 2,
} as const;
export const MANDALA_GENERATE_ARTICLE_MAX_CHARS = 60_000;

export interface GeneratedRelation {
  to: number;
  label: string;
}
export interface GeneratedPoint {
  position: number;
  title: string;
  body: string;
  evidence: string;
  relations: GeneratedRelation[];
}
export interface GeneratedCenter {
  title: string;
  body: string;
}
export interface GeneratedItem {
  position: number;
  title: string;
  body: string;
  evidence: string;
}
export interface DroppedCounts {
  points: number;
  relations: number;
  items: number;
  reasons: string[];
}
export type Stage1Result = { ok: true; center: GeneratedCenter; points: GeneratedPoint[]; dropped: DroppedCounts } | { ok: false; reason: string; dropped: DroppedCounts };
export type Stage2Result = { ok: true; items: GeneratedItem[]; dropped: DroppedCounts } | { ok: false; reason: string; dropped: DroppedCounts };

// ───────────────────────────────────────────────────────────────────────────
// 根拠（evidence）の実在判定: 空白・改行の正規化だけ（言い換えは通さない）
// ───────────────────────────────────────────────────────────────────────────

export function normalizeEvidence(s: string): string {
  return (s ?? '').replace(/[\s　]+/g, '');
}
export function evidenceExists(evidence: string, article: string): boolean {
  const e = normalizeEvidence(evidence);
  if (e.length < 4) return false;
  return normalizeEvidence(article).includes(e);
}

export function countSentences(text: string): number {
  const t = (text ?? '').trim();
  if (!t) return 0;
  const parts = t.split(/[。！？!?\n]+/).map((s) => s.trim()).filter(Boolean);
  return parts.length;
}

function str(v: unknown, max?: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\r\n?/g, '\n').trim();
  if (!s) return null;
  if (max !== undefined && s.length > max) return null; // 上限超えは切らずに捨てる（R-101）
  return s;
}

function emptyDropped(): DroppedCounts {
  return { points: 0, relations: 0, items: 0, reasons: [] };
}

// ───────────────────────────────────────────────────────────────────────────
// 第1段階（中央＋要点8）の検証（決定的）
// ───────────────────────────────────────────────────────────────────────────

/** AI の JSON → 中央と要点。position は 0〜8（4 以外）を出現順に割り当てる（AI が指定していれば有効な値を尊重） */
export function validateStage1(json: unknown, article: string): Stage1Result {
  const dropped = emptyDropped();
  const o = (json ?? {}) as Record<string, unknown>;
  const centerRaw = (o.center ?? {}) as Record<string, unknown>;
  const centerTitle = str(centerRaw.title, GEN_LIMITS.centerTitle);
  let centerBody = str(centerRaw.body) ?? '';
  if (countSentences(centerBody) > GEN_LIMITS.centerBodySentences) {
    dropped.reasons.push('中央の要約が5文を超えたため本文を空にしました');
    centerBody = '';
  }
  if (!centerTitle) return { ok: false, reason: '中央（記事の主題）が空か20字を超えています', dropped };
  const rawPoints = Array.isArray(o.points) ? o.points : [];
  const used = new Set<number>();
  const kept: GeneratedPoint[] = [];
  const pending: { p: GeneratedPoint; relRaw: unknown }[] = [];
  for (const rp of rawPoints) {
    const r = (rp ?? {}) as Record<string, unknown>;
    const title = str(r.title, GEN_LIMITS.pointTitle);
    const body = str(r.body);
    const evidence = str(r.evidence, GEN_LIMITS.evidence);
    if (!title || !body || !evidence) {
      dropped.points += 1;
      dropped.reasons.push(`要点「${typeof r.title === 'string' ? r.title.slice(0, 15) : '?'}」: 見出し／説明／引用が空か上限超え`);
      continue;
    }
    const n = countSentences(body);
    if (n > GEN_LIMITS.pointBodyMaxSentences) {
      dropped.points += 1;
      dropped.reasons.push(`要点「${title}」: 説明が6文を超えています`);
      continue;
    }
    if (!evidenceExists(evidence, article)) {
      dropped.points += 1;
      dropped.reasons.push(`要点「${title}」: 引用が記事本文に見つかりません`);
      continue;
    }
    let position = typeof r.position === 'number' && Number.isInteger(r.position) && r.position !== MANDALA_CENTER && r.position >= 0 && r.position <= 8 && !used.has(r.position) ? r.position : -1;
    if (position < 0) position = MANDALA_OUTLINE_POSITIONS.find((p) => !used.has(p)) ?? -1;
    if (position < 0) {
      dropped.points += 1;
      dropped.reasons.push(`要点「${title}」: 9件目以降は載せられません`);
      continue;
    }
    used.add(position);
    const p: GeneratedPoint = { position, title, body, evidence, relations: [] };
    kept.push(p);
    pending.push({ p, relRaw: r.relations });
  }
  // 関連（to: 有効な position・4 以外・自分以外・残った要点のみ・上限3・重複なし）
  const keptPositions = new Set(kept.map((p) => p.position));
  for (const { p, relRaw } of pending) {
    const arr = Array.isArray(relRaw) ? relRaw : [];
    const seen = new Set<number>();
    for (const rr of arr) {
      const rel = (rr ?? {}) as Record<string, unknown>;
      const to = typeof rel.to === 'number' ? rel.to : Number.NaN;
      const label = str(rel.label, GEN_LIMITS.relationLabel);
      if (!Number.isInteger(to) || to === MANDALA_CENTER || to === p.position || to < 0 || to > 8 || !keptPositions.has(to) || !label || seen.has(to) || p.relations.length >= GEN_LIMITS.relationsMax) {
        dropped.relations += 1;
        continue;
      }
      seen.add(to);
      p.relations.push({ to, label });
    }
  }
  kept.sort((a, b) => a.position - b.position);
  if (kept.length < GEN_LIMITS.pointsMin) return { ok: false, reason: `根拠のある要点が${kept.length}件で、2件未満のため作成しません`, dropped };
  return { ok: true, center: { title: centerTitle, body: centerBody }, points: kept, dropped };
}

// ───────────────────────────────────────────────────────────────────────────
// 第2段階（要点ごとの小項目8）の検証（決定的）
// ───────────────────────────────────────────────────────────────────────────

export function validateStage2(json: unknown, article: string): Stage2Result {
  const dropped = emptyDropped();
  const o = (json ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(o.items) ? o.items : Array.isArray(json) ? (json as unknown[]) : [];
  const items: GeneratedItem[] = [];
  const used = new Set<number>();
  for (const ri of raw) {
    const r = (ri ?? {}) as Record<string, unknown>;
    const title = str(r.title, GEN_LIMITS.itemTitle);
    const body = str(r.body);
    const evidence = str(r.evidence, GEN_LIMITS.evidence);
    if (!title || !body || !evidence) {
      dropped.items += 1;
      dropped.reasons.push(`小項目「${typeof r.title === 'string' ? r.title.slice(0, 15) : '?'}」: 見出し／説明／引用が空か上限超え`);
      continue;
    }
    if (countSentences(body) > GEN_LIMITS.itemBodyMaxSentences) {
      dropped.items += 1;
      dropped.reasons.push(`小項目「${title}」: 説明が4文を超えています`);
      continue;
    }
    if (!evidenceExists(evidence, article)) {
      dropped.items += 1;
      dropped.reasons.push(`小項目「${title}」: 引用が記事本文に見つかりません`);
      continue;
    }
    const position = MANDALA_OUTLINE_POSITIONS.find((p) => !used.has(p));
    if (position === undefined) {
      dropped.items += 1;
      dropped.reasons.push(`小項目「${title}」: 9件目以降は載せられません`);
      continue;
    }
    used.add(position);
    items.push({ position, title, body, evidence });
  }
  if (items.length === 0) return { ok: false, reason: '根拠のある小項目がありません', dropped };
  return { ok: true, items, dropped };
}

// ───────────────────────────────────────────────────────────────────────────
// 本文への書き方（引用は Markdown 引用で末尾に・R-97）
// ───────────────────────────────────────────────────────────────────────────

export const EVIDENCE_QUOTE_PREFIX = '> 引用: ';
export function cellBodyWithEvidence(body: string, evidence: string): string {
  const b = body.trim();
  const e = evidence.trim();
  if (!e) return b;
  return `${b}\n\n${EVIDENCE_QUOTE_PREFIX}${e}`;
}

// ───────────────────────────────────────────────────────────────────────────
// プロンプト（2種・Gemini・JSON）
// ───────────────────────────────────────────────────────────────────────────

const RULES = `# 絶対に守ること
- 記事に書かれている内容だけを使う。記事に無い事実・数字・評価・体験を**補わない**（要約と言い換えは可）
- evidence は記事本文からの**引用そのまま**（原文の連続した一節・60字以内・言い換え禁止）。引用が無い項目は出さない
- 文字数の上限を守る（超えた項目は採用されない）`;

export function buildStage1Prompt(article: string): { system: string; prompt: string } {
  const system = 'あなたは記事の構造を整理する編集者です。記事の要点と要点どうしの関連性を、9マスのマンダラ（中央＝主題・周囲8＝要点）に再構成します。出力は JSON のみ。';
  const prompt = `以下の記事から、中央（主題）と要点（最大8）を抽出してください。

${RULES}

# 形式
- center.title: 記事の主題（20字以内）／center.body: 記事全体の要約（5文以内）
- points[]: 最大8件。title（15字以内）・body（要点の説明・3〜6文）・evidence（記事からの引用・60字以内・原文そのまま）・
  relations[]（他の要点との関係。to は相手の要点の番号（0〜7・自分以外）・label は15字以内。0〜3件）
- position は 0〜3・5〜8 の順に自動で割り当てるので、points の順番だけ整えればよい（relations.to は points の配列の添字 0〜7 で書く）

# 記事
${article.slice(0, MANDALA_GENERATE_ARTICLE_MAX_CHARS)}

# 出力フォーマット（必ずこの JSON のみ。前置き・コードフェンス禁止）
{ "center": { "title": "…", "body": "…" }, "points": [ { "title": "…", "body": "…", "evidence": "…", "relations": [ { "to": 0, "label": "…" } ] } ] }`;
  return { system, prompt };
}

export function buildStage2Prompt(article: string, point: Pick<GeneratedPoint, 'title' | 'body' | 'evidence'>): { system: string; prompt: string } {
  const system = 'あなたは記事の構造を整理する編集者です。1つの要点をさらに細かい小項目（最大8）に分けます。出力は JSON のみ。';
  const prompt = `以下の記事のうち、次の要点に関する小項目（最大8）を抽出してください。

# 要点
- 見出し: ${point.title}
- 説明: ${point.body}
- 引用: ${point.evidence}

${RULES}

# 形式
- items[]: 最大8件。title（15字以内）・body（2〜4文）・evidence（記事からの引用・60字以内・原文そのまま）
- この要点に関係する内容だけ。記事に該当が少なければ少なくてよい（無理に8件にしない）

# 記事
${article.slice(0, MANDALA_GENERATE_ARTICLE_MAX_CHARS)}

# 出力フォーマット（必ずこの JSON のみ。前置き・コードフェンス禁止）
{ "items": [ { "title": "…", "body": "…", "evidence": "…" } ] }`;
  return { system, prompt };
}

/** relations.to を「points の添字」→「position」へ写す（プロンプトは添字で書かせる＝AI に position 表を覚えさせない） */
export function remapRelationIndexes(json: unknown): unknown {
  const o = (json ?? {}) as Record<string, unknown>;
  const points = Array.isArray(o.points) ? o.points : [];
  const idxToPos = points.map((_, i) => MANDALA_OUTLINE_POSITIONS[i] ?? -1);
  const mapped = points.map((p, i) => {
    const r = (p ?? {}) as Record<string, unknown>;
    const rels = Array.isArray(r.relations) ? r.relations : [];
    return {
      ...r,
      position: idxToPos[i],
      relations: rels.map((rel) => {
        const x = (rel ?? {}) as Record<string, unknown>;
        // 添字→position は固定表（0→0,1→1,2→2,3→3,4→5,5→6,6→7,7→8）。存在しない要点への関連は validateStage1 が捨てる
        const to = typeof x.to === 'number' && Number.isInteger(x.to) ? MANDALA_OUTLINE_POSITIONS[x.to] ?? -1 : -1;
        return { ...x, to };
      }),
    };
  });
  return { ...o, points: mapped };
}

// maxTokens（各段階の想定量から。下限 2048 ガード・R-03）／個別タイムアウト（リトライ 0・maxDuration 120 の内側・R-73）
export const GEN_STAGE1_MAX_TOKENS = Math.max(2048, 4096);
export const GEN_STAGE2_MAX_TOKENS = Math.max(2048, 3072);
export const GEN_STAGE_TIMEOUT_MS = 100_000;
export const GEN_MAX_DURATION_S = 120;
export const GEN_STAGE2_PARALLEL = 8;

// ───────────────────────────────────────────────────────────────────────────
// meta（R-113 キー単位）: chart.meta.generated／chart.meta.relations／cell.meta.origin
// ───────────────────────────────────────────────────────────────────────────

export interface GeneratedSource {
  scope: string;
  item_key: string;
  title: string;
}
export interface GeneratedMeta {
  source: GeneratedSource;
  model: string;
  mode: MandalaGenerateMode;
  generatedAt: string;
  dropped: { points: number; items: number };
}
export interface MandalaRelation {
  from: number;
  to: number;
  label: string;
}
export type CellOrigin = 'ai' | 'edited';

export function parseGeneratedMeta(meta: Record<string, unknown> | null | undefined): GeneratedMeta | null {
  const g = meta?.generated;
  if (!g || typeof g !== 'object') return null;
  const o = g as Record<string, unknown>;
  const s = (o.source ?? {}) as Record<string, unknown>;
  if (typeof s.scope !== 'string' || typeof s.item_key !== 'string') return null;
  const d = (o.dropped ?? {}) as Record<string, unknown>;
  return {
    source: { scope: s.scope, item_key: s.item_key, title: typeof s.title === 'string' ? s.title : '' },
    model: typeof o.model === 'string' ? o.model : '',
    mode: isMandalaGenerateMode(o.mode) ? o.mode : '9',
    generatedAt: typeof o.generatedAt === 'string' ? o.generatedAt : '',
    dropped: { points: typeof d.points === 'number' ? d.points : 0, items: typeof d.items === 'number' ? d.items : 0 },
  };
}
export function parseRelations(meta: Record<string, unknown> | null | undefined): MandalaRelation[] {
  const r = meta?.relations;
  if (!Array.isArray(r)) return [];
  return r
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((x) => typeof x.from === 'number' && typeof x.to === 'number' && typeof x.label === 'string')
    .map((x) => ({ from: x.from as number, to: x.to as number, label: x.label as string }));
}
export function relationsFromPoints(points: readonly GeneratedPoint[]): MandalaRelation[] {
  return points.flatMap((p) => p.relations.map((r) => ({ from: p.position, to: r.to, label: r.label })));
}
/** マス（position）から見た関連（自分が from のもの＋自分が to のもの）。順序は固定 */
export function relationsOf(relations: readonly MandalaRelation[], position: number): { position: number; label: string; direction: 'out' | 'in' }[] {
  const out = relations.filter((r) => r.from === position).map((r) => ({ position: r.to, label: r.label, direction: 'out' as const }));
  const inn = relations.filter((r) => r.to === position).map((r) => ({ position: r.from, label: r.label, direction: 'in' as const }));
  return [...out, ...inn].sort((a, b) => a.position - b.position || (a.direction === 'out' ? -1 : 1));
}
export function relationLabelOf(position: number): string {
  return MANDALA_POSITION_LABELS[position] ?? String(position);
}

export function cellOrigin(cell: Pick<MandalaCell, 'meta'> | null | undefined): CellOrigin | null {
  const o = cell?.meta?.origin;
  return o === 'ai' || o === 'edited' ? o : null;
}
export function hasAiOrigin(cells: readonly Pick<MandalaCell, 'meta'>[]): boolean {
  return cells.some((c) => cellOrigin(c) === 'ai');
}
export function editedCells(cells: readonly Pick<MandalaCell, 'meta'>[]): number {
  return cells.filter((c) => cellOrigin(c) === 'edited').length;
}
export const REGENERATE_DISABLED_REASON = '院長が編集したマスがあるため再生成できません（編集を消さないため）';
/** 再生成の可否（§3-6）: edited が1つでもあれば無効化＋理由 */
export function regenerateState(cells: readonly Pick<MandalaCell, 'meta'>[]): { enabled: boolean; reason: string | null } {
  const n = editedCells(cells);
  return n > 0 ? { enabled: false, reason: `${REGENERATE_DISABLED_REASON}（${n}マス）` } : { enabled: true, reason: null };
}
export const AI_ORIGIN_NOTICE = '骨子は記事から生成されたもので、体験ではありません';

/** 元記事へのリンク（新しいタブ）。scope ごとに開ける画面へ */
export function generatedSourceHref(source: GeneratedSource): string {
  if (source.scope === 'library') return `/dashboard/library?open=${encodeURIComponent(source.item_key)}`;
  if (source.scope === 'text_analysis') return '/dashboard/text-analysis?tab=saved';
  return '/dashboard/context';
}
export function generatedBadgeLabel(meta: GeneratedMeta): string {
  return `🤖 記事から生成（${meta.mode}マス）`;
}

/** 費用の目安（Gemini・314 の単価・決定的）。入力＝記事＋定型、出力＝段階ごとの想定 */
export function estimateGenerateCost(articleChars: number, mode: MandalaGenerateMode, jstDate?: string): number | null {
  const inputPerCall = Math.max(0, articleChars) + COMPARE_PROMPT_OVERHEAD_CHARS;
  const calls = mode === '81' ? 1 + 8 : 1;
  const outputTokens = mode === '81' ? 2500 + 8 * 1800 : 2500;
  return costOf(GEMINI_TEXT_MODEL, inputPerCall * calls, outputTokens, jstDate);
}
