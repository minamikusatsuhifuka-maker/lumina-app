// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 315: 🖼 図解生成（記事→表・図・画像）の純ロジック（DB 非依存・決定的・R-74／R-108）
//
// 設計（§1-3・2層）:
//   表・フロー・比較・手順・概念図 … プランの文字列を**コードで描画**（lib/visual-templates）＝文字は100%プランどおり
//   イメージ … GPT Image 2.5 で**文字なし**の絵柄を生成し、プランの文字を重ねる（既定）。「AIに文字も描かせる」はオプトイン
// 規約: 図に入る文字は院長が確認・編集したプランの文字列だけ（AI再要約禁止）。プランの語句は**元テキストに実在**するもののみ
//   （プロンプト＋コード側 findForeignPhrases の二段構え・R-114 と同じ考え方）。ビフォーアフター型は候補に出さない（type を弾く）。
//   ラベルの医療広告ガードは決定的な findBannedExpressions（content-verify）で（R-69: ガードが後勝ち＝該当があれば描けない）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { findBannedExpressions } from '@/lib/content-verify';
import { IMAGE_MODEL_IDS, type ImageAspectKey, type ImageQualityKey } from '@/lib/model-pricing';

export type VisualType = 'table' | 'flow' | 'compare' | 'steps' | 'concept' | 'relation' | 'timeline' | 'figures' | 'onepage' | 'image';
export const VISUAL_TYPES: readonly VisualType[] = ['table', 'flow', 'compare', 'steps', 'concept', 'relation', 'timeline', 'figures', 'onepage', 'image'];
/** 決定的描画の5種（イメージ以外） */
export const VISUAL_DETERMINISTIC_TYPES: readonly VisualType[] = ['table', 'flow', 'compare', 'steps', 'concept', 'relation', 'timeline', 'figures', 'onepage'];
/** 候補に出さない型（治療前後・効果対比の文脈で使われるため。プロンプト禁止＋コード側で弾く） */
export const VISUAL_BANNED_TYPES: readonly string[] = ['beforeafter', 'before_after', 'before-after', 'ビフォーアフター'];

export const VISUAL_TYPE_META: Record<VisualType, { emoji: string; label: string; hint: string }> = {
  table: { emoji: '📋', label: '表', hint: 'groups＝列（heading が列名・points が各行の値）。2〜4列' },
  flow: { emoji: '➡️', label: 'フロー', hint: 'groups は1つ・points が左から右へ流れる要素（3〜6個）' },
  compare: { emoji: '⚖️', label: '比較', hint: 'groups＝比較対象（2〜3）・heading が対象名・points が特徴' },
  steps: { emoji: '🪜', label: '手順', hint: 'groups は1つ・points が上から順の手順（3〜8個）' },
  concept: { emoji: '🧭', label: '概念図', hint: 'title が中心・groups＝枝（heading が枝の名前・points が要素）。2〜6枝' },
  // 317 §3-3: 4種を追加（コード描画・文字はプランどおり）
  relation: { emoji: '🕸', label: '関連図', hint: 'groups＝ノード（heading がノード名・最大8）。points は「→ 相手ノード名: 関係ラベル」（辺・最大12）。円周配置' },
  timeline: { emoji: '📅', label: 'タイムライン', hint: 'groups＝出来事（heading が時期の文字列・points[0] が出来事・points[1] は補足）。3〜8件・時期は解釈しない' },
  figures: { emoji: '🔢', label: '数値ハイライト', hint: 'groups＝数字カード（heading が見出し・points[0] が数値＋単位・points[1] が引用）。数値＋単位は引用と完全一致・3〜6件' },
  onepage: { emoji: '📄', label: '1枚サマリー', hint: 'title＋要点3（groups[0].points）＋一言（groups[1].points[0]）。描画済みの図を埋め込める' },
  image: { emoji: '🖼', label: 'イメージ', hint: '絵柄は AI・文字はプランの文字列を重ねる。heading／points が重ねる文字' },
};

/** 317: 関連図の辺の書き方「→ 相手ノード名: ラベル」（ラベル省略可） */
export const RELATION_EDGE_RE = /^(?:→|->|→)\s*([^:：]+?)\s*(?:[:：]\s*(.+))?$/;
export const RELATION_MAX_NODES = 8;
export const RELATION_MAX_EDGES = 12;
export const TIMELINE_MIN_ITEMS = 3;
export const TIMELINE_MAX_ITEMS = 8;
export const FIGURES_MIN = 3;
export const FIGURES_MAX = 6;
export const ONEPAGE_POINTS = 3;

export interface RelationEdge {
  from: number;
  to: number;
  label: string;
}
/** 関連図の辺を決定的に解く（相手ノードは heading の完全一致・自己辺と重複は捨てる・上限12） */
export function relationEdgesOf(plan: Pick<VisualPlan, 'groups'>): { edges: RelationEdge[]; dropped: string[] } {
  const nodes = plan.groups.map((g) => (g.heading ?? '').trim());
  const edges: RelationEdge[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  plan.groups.forEach((g, from) => {
    for (const p of g.points) {
      const m = RELATION_EDGE_RE.exec(p.trim());
      const target = m ? m[1].trim() : '';
      const to = nodes.indexOf(target);
      if (!m || to < 0 || to === from || seen.has(`${from}-${to}`) || edges.length >= RELATION_MAX_EDGES) {
        dropped.push(p);
        continue;
      }
      seen.add(`${from}-${to}`);
      edges.push({ from, to, label: (m[2] ?? '').trim() });
    }
  });
  return { edges, dropped };
}

/**
 * 317: 型ごとの追加検証（決定的）。返り値は「元テキストに無い扱いにする文字列 → 無い語」。
 * - figures: points[0]（数値＋単位）が points[1]（引用）に含まれ、引用が本文に含まれること（数字の改変を防ぐ）
 * - relation: 辺の相手ノードが実在すること（無い辺は描かないので foreign にはしない。数だけ dropped）
 */
export function typedPlanIssues(plan: Pick<VisualPlan, 'type' | 'groups'>, sourceText: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const src = normalizeForMatch(sourceText);
  if (plan.type === 'figures') {
    for (const g of plan.groups) {
      const value = (g.points[0] ?? '').trim();
      const evidence = (g.points[1] ?? '').trim();
      if (!value) continue;
      if (!evidence || !normalizeForMatch(evidence).includes(normalizeForMatch(value))) out[value] = [`引用と完全一致しない数値: ${value}`];
      else if (!src.includes(normalizeForMatch(evidence))) out[evidence] = [`引用が本文に無い: ${evidence.slice(0, 20)}`];
    }
  }
  return out;
}

export const VISUAL_MAX_PLANS = 6;
export const VISUAL_MAX_GROUPS = 6;
export const VISUAL_MAX_POINTS = 8;
export const VISUAL_TITLE_MAX = 60;
export const VISUAL_LABEL_MAX = 80;
export const VISUAL_SOURCE_MAX_CHARS = 60_000;
/** まとめて1つの図解にする上限（R-101） */
export const VISUAL_SOURCE_MAX_ITEMS = 3;

export interface VisualGroup {
  heading?: string;
  points: string[];
}
export interface VisualPlan {
  id: string;
  type: VisualType;
  title: string;
  groups: VisualGroup[];
  /** イメージ型: 絵柄の指示（院長が追記できる。文字はここに書かない） */
  imagePrompt?: string;
  /** 317: 1枚サマリーに埋め込む描画済みの図（data URI・描画時だけ渡す。保存するプランには含めない） */
  embedImage?: string;
}

export function isVisualType(v: unknown): v is VisualType {
  return typeof v === 'string' && (VISUAL_TYPES as readonly string[]).includes(v);
}

/** 図解の入口（元テキストの scope）。マンダラのリンク（302）と同じ語彙 */
export const VISUAL_SOURCE_SCOPES: readonly string[] = ['library', 'text_analysis', 'context'];
export function isVisualSourceScope(v: unknown): v is string {
  return typeof v === 'string' && VISUAL_SOURCE_SCOPES.includes(v);
}
export function visualSourceKey(scope: string, id: string): string {
  return `${scope}:${id}`;
}

// ───────────────────────────────────────────────────────────────────────────
// 「元テキストに実在する語句」の判定（決定的）
// ───────────────────────────────────────────────────────────────────────────

/** 比較用の正規化: NFKC・空白除去・小文字・全角記号の一部を半角に */
export function normalizeForMatch(s: string): string {
  return (s ?? '')
    .normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/[〜～]/g, '~')
    .replace(/[・･]/g, '')
    .replace(/[「」『』（）()［］\[\]【】"'“”‘’、。,.:：;；!！?？]/g, '')
    .toLowerCase();
}

/** プランに載る全文字列（タイトル・見出し・要素）。順序は固定 */
export function collectPlanStrings(plan: Pick<VisualPlan, 'title' | 'groups'>): string[] {
  const out: string[] = [];
  if (plan.title?.trim()) out.push(plan.title.trim());
  for (const g of plan.groups) {
    if (g.heading?.trim()) out.push(g.heading.trim());
    for (const p of g.points) if (p?.trim()) out.push(p.trim());
  }
  return out;
}

/**
 * 315是正①: 実在チェックは**語句単位**。文字列を句読点・空白・記号と付属語（助詞・助動詞・形式名詞・接続詞）で分割し、
 * 残った内容語（2文字以上）が正規化した元テキストに部分文字列として含まれなければ「実在しない語句」。
 * 「朝と夜」のように元テキストの語句を付属語でつないだ見出しは通り、「スキンケア」のような言い換えは落ちる。
 * 1文字の語（例 "朝"・"3"）は元テキストに偶然含まれやすいので実在扱い（判定に使わない）
 */
export const VISUAL_FUNCTION_WORDS: readonly string[] = [
  'について', 'における', 'によって', 'として', 'に対して', 'のための', 'ための', 'ところ', 'こと', 'もの', 'ため', 'など', 'ながら',
  'ません', 'でした', 'ました', 'ます', 'です', 'だった', 'である', 'ない', 'たい', 'れる', 'られる', 'せる', 'させる', 'すべき', 'べき',
  'される', 'できる', 'する', 'なる', 'ある', 'いる',
  'から', 'まで', 'より', 'ほど', 'だけ', 'しか', 'でも', 'とは', 'には', 'では', 'への', 'との', 'での', 'ので', 'のに', 'けれど', 'また', 'および', 'または', 'そして', 'しかし',
];
/** 1文字の助詞等。内容語（ひらがな語）の内部で割らないよう、**両側が非ひらがな**（漢字・カナ・数字・端）のときだけ区切りにする */
export const VISUAL_SINGLE_PARTICLES = 'のにをはがとでもへやかしてただねよな';
const FUNCTION_WORD_RE = new RegExp([...VISUAL_FUNCTION_WORDS].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const SINGLE_PARTICLE_RE = new RegExp(`(?<![ぁ-ん])[${VISUAL_SINGLE_PARTICLES}](?![ぁ-ん])`, 'g');
const SEPARATOR_RE = /[\s　、。，．,.:：;；!！?？・･「」『』（）()［］\[\]【】"'“”‘’〜～\-–—/／|｜→←↔＋+＝=%％&＆]+/g;

/** 文字列を内容語に分ける（決定的）。付属語は落とし、2文字未満は捨てる */
export function tokenizeContentWords(s: string): string[] {
  const parts = (s ?? '')
    .normalize('NFKC')
    .split(SEPARATOR_RE)
    .flatMap((p) => p.split(FUNCTION_WORD_RE))
    .flatMap((p) => p.split(SINGLE_PARTICLE_RE));
  return parts.map((p) => normalizeForMatch(p)).filter((p) => p.length >= 2);
}

/** 文字列ごとに、元テキストに無い内容語 */
export function foreignTokensOf(s: string, normalizedSource: string): string[] {
  const out: string[] = [];
  for (const t of tokenizeContentWords(s)) if (!normalizedSource.includes(t) && !out.includes(t)) out.push(t);
  return out;
}

export function findForeignPhrases(plan: Pick<VisualPlan, 'title' | 'groups'>, sourceText: string): string[] {
  const src = normalizeForMatch(sourceText);
  const out: string[] = [];
  for (const s of collectPlanStrings(plan)) {
    if (foreignTokensOf(s, src).length > 0 && !out.includes(s)) out.push(s);
  }
  return out;
}

/** 文字列→無い内容語（画面で「どの語が無いか」を示す） */
export function findForeignTokens(plan: Pick<VisualPlan, 'title' | 'groups'>, sourceText: string): Record<string, string[]> {
  const src = normalizeForMatch(sourceText);
  const out: Record<string, string[]> = {};
  for (const s of collectPlanStrings(plan)) {
    const t = foreignTokensOf(s, src);
    if (t.length > 0) out[s] = t;
  }
  return out;
}

/** ラベルの医療広告ガード（決定的）。該当があればその文字列 */
export function findBannedLabels(plan: Pick<VisualPlan, 'title' | 'groups'>): { text: string; matched: string; reason: string }[] {
  const out: { text: string; matched: string; reason: string }[] = [];
  for (const s of collectPlanStrings(plan)) {
    const hits = findBannedExpressions(s, { maxResults: 3 });
    for (const h of hits) out.push({ text: s, matched: h.matched, reason: h.reason });
  }
  return out;
}

export interface PlanCheck {
  foreign: string[];
  /** 315是正①: 文字列ごとの「元テキストに無い内容語」 */
  foreignTokens: Record<string, string[]>;
  /** 317: 型ごとの追加検証（数値の完全一致など） */
  typed: Record<string, string[]>;
  banned: { text: string; matched: string; reason: string }[];
  empty: boolean;
  /** 描ける（実在しない語句なし・NG表現なし・要素あり） */
  ok: boolean;
}
export function checkPlan(plan: VisualPlan, sourceText: string): PlanCheck {
  const foreignBase = findForeignPhrases(plan, sourceText);
  const foreignTokens = findForeignTokens(plan, sourceText);
  const typed = typedPlanIssues(plan, sourceText);
  for (const [k, v] of Object.entries(typed)) foreignTokens[k] = [...(foreignTokens[k] ?? []), ...v];
  const foreign = [...foreignBase, ...Object.keys(typed).filter((k) => !foreignBase.includes(k))];
  const banned = findBannedLabels(plan);
  const empty = !plan.title.trim() || plan.groups.every((g) => g.points.length === 0 && !g.heading?.trim());
  return { foreign, foreignTokens, typed, banned, empty, ok: foreign.length === 0 && banned.length === 0 && !empty };
}

export const VISUAL_BLOCK_REASON_FOREIGN = '元テキストに無い語句があります（赤い印の文字を元テキストの表現に直すと描けます）';
export const VISUAL_BLOCK_REASON_BANNED = '医療広告のNG表現が含まれています（該当の文字を直すと描けます）';
export const VISUAL_BLOCK_REASON_EMPTY = 'タイトルと要素を入れてください';
export function planBlockReason(check: PlanCheck): string | null {
  if (check.empty) return VISUAL_BLOCK_REASON_EMPTY;
  if (check.foreign.length > 0) return VISUAL_BLOCK_REASON_FOREIGN;
  if (check.banned.length > 0) return VISUAL_BLOCK_REASON_BANNED;
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// AI 出力（JSON）の検証・正規化（fail-closed）
// ───────────────────────────────────────────────────────────────────────────

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** AI の JSON → VisualPlan[]。型が不正・禁止（beforeafter）・空は落とす。上限 6 件 */
export function parseVisualPlans(json: unknown, idPrefix = 'v', allowedTypes?: readonly VisualType[]): { plans: VisualPlan[]; rejected: { reason: string; raw: unknown }[] } {
  const arr = Array.isArray((json as { visuals?: unknown })?.visuals) ? ((json as { visuals: unknown[] }).visuals) : Array.isArray(json) ? (json as unknown[]) : [];
  const plans: VisualPlan[] = [];
  const rejected: { reason: string; raw: unknown }[] = [];
  arr.forEach((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const typeRaw = typeof o.type === 'string' ? o.type.trim().toLowerCase() : '';
    if (VISUAL_BANNED_TYPES.includes(typeRaw)) {
      rejected.push({ reason: 'ビフォーアフター型は候補に出さない（治療前後・効果対比に使わない）', raw });
      return;
    }
    if (!isVisualType(typeRaw)) {
      rejected.push({ reason: `未知の型: ${typeRaw || '(空)'}`, raw });
      return;
    }
    if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(typeRaw)) {
      rejected.push({ reason: `選んでいない型: ${typeRaw}`, raw });
      return;
    }
    const title = clean(o.title, VISUAL_TITLE_MAX);
    const groups: VisualGroup[] = (Array.isArray(o.groups) ? o.groups : [])
      .map((g) => {
        const go = (g ?? {}) as Record<string, unknown>;
        const heading = clean(go.heading, VISUAL_LABEL_MAX) || undefined;
        const points = (Array.isArray(go.points) ? go.points : []).map((p) => clean(p, VISUAL_LABEL_MAX)).filter(Boolean).slice(0, VISUAL_MAX_POINTS);
        return { heading, points };
      })
      .filter((g) => g.points.length > 0 || g.heading)
      .slice(0, VISUAL_MAX_GROUPS);
    if (!title || groups.length === 0) {
      rejected.push({ reason: 'タイトルか要素が空', raw });
      return;
    }
    const imagePrompt = typeRaw === 'image' ? clean(o.imagePrompt, 300) || undefined : undefined;
    plans.push({ id: `${idPrefix}${i + 1}`, type: typeRaw, title, groups, ...(imagePrompt ? { imagePrompt } : {}) });
  });
  return { plans: plans.slice(0, VISUAL_MAX_PLANS), rejected };
}

// ───────────────────────────────────────────────────────────────────────────
// 描画の設定（向き・サイズ・折り返し）
// ───────────────────────────────────────────────────────────────────────────

export type VisualOrientation = ImageAspectKey;
export const VISUAL_ORIENTATIONS: readonly VisualOrientation[] = ['square', 'landscape', 'portrait'];
export const VISUAL_ORIENTATION_LABEL: Record<VisualOrientation, string> = { square: '正方形', landscape: '横', portrait: '縦' };
/** 決定的描画のキャンバス幅（向きごと）。高さは内容から見積もる（R-72）が、向きの最小高さは確保する */
export const VISUAL_CANVAS_WIDTH: Record<VisualOrientation, number> = { square: 1200, landscape: 1600, portrait: 900 };
export function minCanvasHeight(orientation: VisualOrientation): number {
  const w = VISUAL_CANVAS_WIDTH[orientation];
  if (orientation === 'square') return w;
  if (orientation === 'portrait') return Math.round((w * 16) / 9);
  return Math.round((w * 9) / 16);
}

/** 決定的な折り返し（全角基準・1行あたりの文字数）。同じ入力→同じ行。空文字は1行 */
export function wrapText(text: string, charsPerLine: number): string[] {
  const t = (text ?? '').trim();
  if (!t) return [''];
  const n = Math.max(1, Math.floor(charsPerLine));
  const lines: string[] = [];
  for (let i = 0; i < t.length; i += n) lines.push(t.slice(i, i + n));
  return lines;
}
/** 行数の見積もり（R-72） */
export function lineCount(text: string, charsPerLine: number): number {
  return wrapText(text, charsPerLine).length;
}

// ───────────────────────────────────────────────────────────────────────────
// イメージ（GPT Image 2.5）
// ───────────────────────────────────────────────────────────────────────────

export type VisualImageModelKey = keyof typeof IMAGE_MODEL_IDS;
export const VISUAL_IMAGE_DEFAULT_MODEL: VisualImageModelKey = 'flare';
export const VISUAL_IMAGE_QUALITIES: readonly ImageQualityKey[] = ['low', 'medium', 'high'];
export const VISUAL_IMAGE_DEFAULT_QUALITY: ImageQualityKey = 'medium';
export const VISUAL_IMAGE_SIZE: Record<VisualOrientation, string> = { square: '1024x1024', landscape: '1536x1024', portrait: '1024x1536' };

export interface VisualImageSettings {
  orientation: VisualOrientation;
  quality: ImageQualityKey;
  /** true＝AI に文字も描かせる（オプトイン）。false（既定）＝絵柄だけ生成し、文字は SVG で重ねる */
  aiText: boolean;
  extraPrompt: string;
  model: VisualImageModelKey;
}
export const VISUAL_IMAGE_DEFAULT_SETTINGS: VisualImageSettings = { orientation: 'landscape', quality: 'medium', aiText: false, extraPrompt: '', model: 'flare' };

/** 絵柄の定型指示（文字なし）。ガード（image-guards）はサーバで後から連結する（R-69） */
export const VISUAL_IMAGE_BASE_PROMPT =
  '記事の図解に使うイメージ画像。主題が伝わる具体的なモチーフと日常の文脈を、落ち着いた色調のフラットなイラストで描く。余白を広めに取り、上部と下部に文字を重ねられる空間を残す。';
export const VISUAL_IMAGE_NO_TEXT_RULE = '画像内に文字・数字・ロゴ・透かしを一切入れない（文字は後から重ねる）。';

/** 生成プロンプト（ガード連結前）。aiText のときだけプランの文字列を【文字列】として**そのまま**渡す（要約させない） */
export function buildVisualImagePrompt(plan: VisualPlan, settings: Pick<VisualImageSettings, 'aiText' | 'extraPrompt'>): string {
  const parts = [VISUAL_IMAGE_BASE_PROMPT, `主題: ${plan.title}`];
  if (plan.imagePrompt?.trim()) parts.push(`絵柄の指示: ${plan.imagePrompt.trim()}`);
  if (settings.extraPrompt.trim()) parts.push(`追加の指示: ${settings.extraPrompt.trim()}`);
  if (settings.aiText) {
    const strings = collectPlanStrings(plan);
    parts.push(`【文字列】次の文字列を、この順に、一字一句そのまま画像内に描く（言い換え・要約・追加は禁止）:\n${strings.map((s) => `- ${s}`).join('\n')}`);
  } else {
    parts.push(VISUAL_IMAGE_NO_TEXT_RULE);
  }
  return parts.join('\n');
}

/** 冪等キー（同じプラン・同じ設定の再送は同じ画像）。呼び出し側で userId を前置する */
export function visualImageIdempotencyKey(plan: VisualPlan, settings: VisualImageSettings): string {
  return JSON.stringify({ t: plan.type, ti: plan.title, g: plan.groups, ip: plan.imagePrompt ?? '', o: settings.orientation, q: settings.quality, a: settings.aiText, e: settings.extraPrompt.trim(), m: settings.model });
}

// ───────────────────────────────────────────────────────────────────────────
// 保存（image_gallery.settings.visual・キー単位・R-113）と「🖼 n」
// ───────────────────────────────────────────────────────────────────────────

export interface VisualSourceRef {
  scope: string;
  id: string;
  title: string;
}
export interface VisualGallerySettings {
  visual: {
    version: 1;
    kind: 'render' | 'image-final' | 'image-original';
    plan: VisualPlan;
    orientation: VisualOrientation;
    sourceKeys: string[];
    sources: VisualSourceRef[];
    model?: string;
    quality?: string;
    aiText?: boolean;
    costUsd?: number | null;
    /** 完成画像から元画像（AI）への参照（C2PA を残した方） */
    originalId?: string;
    generatedAt: string;
  };
  size: string;
  model: string;
}

export function buildVisualGallerySettings(input: {
  kind: VisualGallerySettings['visual']['kind'];
  plan: VisualPlan;
  orientation: VisualOrientation;
  sources: VisualSourceRef[];
  width: number;
  height: number;
  model: string;
  quality?: string;
  aiText?: boolean;
  costUsd?: number | null;
  originalId?: string;
  generatedAt: string;
}): VisualGallerySettings {
  return {
    visual: {
      version: 1,
      kind: input.kind,
      plan: input.plan,
      orientation: input.orientation,
      sourceKeys: input.sources.map((s) => visualSourceKey(s.scope, s.id)),
      sources: input.sources,
      model: input.model,
      ...(input.quality ? { quality: input.quality } : {}),
      ...(input.aiText !== undefined ? { aiText: input.aiText } : {}),
      ...(input.costUsd !== undefined ? { costUsd: input.costUsd } : {}),
      ...(input.originalId ? { originalId: input.originalId } : {}),
      generatedAt: input.generatedAt,
    },
    size: `${input.width}x${input.height}`,
    model: input.model,
  };
}

/** 保存名（ギャラリーの title） */
export function visualSaveTitle(plan: VisualPlan, kind: VisualGallerySettings['visual']['kind']): string {
  const suffix = kind === 'image-original' ? '（元画像）' : '';
  return `図解: ${VISUAL_TYPE_META[plan.type].label}「${plan.title}」${suffix}`.slice(0, 120);
}

/** 元テキストの行に出す「🖼 n」 */
export function visualCountLabel(n: number): string {
  return `🖼 ${n}`;
}

/** 生成前の確認ダイアログの本文（決定的） */
export function visualImageConfirmSummary(count: number, perImageUsd: number): { count: number; totalUsd: number } {
  return { count, totalUsd: perImageUsd * count };
}

/** 元テキストの結合（複数件を1つの図解に）。区切りにタイトルを入れる＝プランの語句判定はこの結合文字列に対して行う */
export function joinVisualSources(sources: readonly VisualSourceRef[], bodies: readonly string[]): string {
  return sources
    .map((s, i) => `# ${s.title}\n\n${bodies[i] ?? ''}`)
    .join('\n\n---\n\n')
    .slice(0, VISUAL_SOURCE_MAX_CHARS);
}

/** note への貼り方のガイド文 */
export const VISUAL_NOTE_GUIDE = 'note は画像をアップロードする方式です。ダウンロードした PNG を note の編集画面で「画像」ブロックとして追加してください（コピーした画像はクリップボードから貼り付けできます）。';

// ───────────────────────────────────────────────────────────────────────────
// STEP1 プラン抽出のプロンプト（Gemini・JSON）。制約はプロンプト＋コード側（findForeignPhrases）の二段構え
// ───────────────────────────────────────────────────────────────────────────

export function buildVisualPlanPrompt(sourceText: string, opts: { maxPlans?: number; types?: readonly VisualType[] } = {}): { system: string; prompt: string } {
  const max = opts.maxPlans ?? VISUAL_MAX_PLANS;
  const allowed = opts.types && opts.types.length > 0 ? opts.types : VISUAL_TYPES;
  const typeLines: Record<VisualType, string> = {
    table: '- table: 表。groups＝列（heading が列名・points が各行の値）。2〜4列',
    flow: '- flow: フロー。groups は1つ・points が左から右へ流れる要素（3〜6個・各20字以内）',
    compare: '- compare: 比較。groups＝比較対象（2〜3）・heading が対象名・points が特徴（各24字以内）',
    steps: '- steps: 手順。groups は1つ・points が上から順の手順（3〜8個・各40字以内）',
    concept: '- concept: 概念図。title が中心概念・groups＝枝（heading が枝の名前・points が要素）。2〜6枝',
    relation: '- relation: 関連図。groups＝ノード（heading がノード名・3〜8個）。points は「→ 相手ノード名: 関係ラベル（15字以内）」の形で他ノードへの辺（全体で最大12本）',
    timeline: '- timeline: タイムライン。groups＝出来事（3〜8件・時系列順）。heading が時期（本文の表記そのまま）・points[0] が出来事（20字以内）・points[1] は補足（任意）',
    figures: '- figures: 数値ハイライト。groups＝数字カード（3〜6件）。heading が見出し（15字以内）・points[0] が数値＋単位（本文の表記そのまま・例「約30%」）・points[1] がその数値を含む本文の引用（60字以内・原文そのまま）',
    onepage: '- onepage: 1枚サマリー。title が主題・groups[0].points が要点3つ（各30字以内）・groups[1].heading は「一言」・groups[1].points[0] が締めの一言（30字以内）',
    image: '- image: イメージ画像。heading／points は画像に重ねる短い文字（合計4つ以内・各20字以内）。imagePrompt に絵柄の指示（文字は書かない）',
  };
  const system = 'あなたは医療記事の編集者兼インフォグラフィックデザイナーです。記事の本文から「図解にすると理解が深まる構造」を見つけ、図解の設計データを作ります。図解に入る文字は本文に実際に書かれている語句だけを使います（言い換え・要約・補足・創作は禁止）。';
  const prompt = `以下の本文から、図解の候補を最大${max}個提案してください。

# 型（type は次の${allowed.length}種のみ。これ以外は出さない）
${allowed.map((t) => typeLines[t]).join('\n')}

# 絶対に守ること
- title・heading・points の文字列は、**本文にそのまま書かれている語句**だけを使う（本文からの抜き出し。言い換え・要約・数値の丸め・単位の追加を禁止）
- ビフォーアフター（治療前後・効果の対比・症状の変化）の図解は**提案しない**。type に beforeafter を使わない
- 効果効能の保証・誇大表現・患者の体験談的表現を図解に入れない
- 図解に向く構造が本文に無ければ少なくてよい（無理に作らない）

# 本文
${sourceText.slice(0, VISUAL_SOURCE_MAX_CHARS)}

# 出力フォーマット（必ずこのJSONのみ。前置き・コードフェンス禁止）
{ "visuals": [ { "type": "${allowed.join('|')}", "title": "本文中の語句", "groups": [ { "heading": "本文中の語句（省略可）", "points": ["本文中の語句", "…"] } ], "imagePrompt": "image のときだけ・絵柄の指示" } ] }`;
  return { system, prompt };
}
