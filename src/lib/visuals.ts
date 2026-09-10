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
import { MANDALA_OUTLINE_POSITIONS } from '@/lib/mandala-shared';
import { IMAGE_MODEL_IDS, estimateImageCost, type ImageAspectKey, type ImageQualityKey } from '@/lib/model-pricing';

export type VisualType = 'table' | 'flow' | 'compare' | 'steps' | 'concept' | 'relation' | 'correlation' | 'timeline' | 'figures' | 'onepage' | 'grid9' | 'grid9_talk' | 'bar' | 'hbar' | 'line' | 'pie' | 'image';
// 320: 相関図（correlation）＝関連図の派生。辺に「相関の向きと強さ」を**文字**で書く（label 必須・太さ/色では表さない）
// 324: 9マスシート（grid9）＝中央のテーマ＋周囲8カテゴリ（マンダラと同じ配置・「マンダラとして開く」で決定的にチャート化）
// 325: プレゼン構成の9マス（grid9_talk）とグラフ4種（bar/hbar/line/pie・数値は引用と完全一致・軸は0起点）
export const VISUAL_TYPES: readonly VisualType[] = ['table', 'flow', 'compare', 'steps', 'concept', 'relation', 'correlation', 'timeline', 'figures', 'onepage', 'grid9', 'grid9_talk', 'bar', 'hbar', 'line', 'pie', 'image'];
/** 決定的描画の5種（イメージ以外） */
export const VISUAL_DETERMINISTIC_TYPES: readonly VisualType[] = ['table', 'flow', 'compare', 'steps', 'concept', 'relation', 'correlation', 'timeline', 'figures', 'onepage', 'grid9', 'grid9_talk', 'bar', 'hbar', 'line', 'pie'];
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
  correlation: { emoji: '🔀', label: '相関図', hint: 'groups＝要因（heading・最大8）。points は「→ 相手: 相関の向きと強さ（文字・必須）」（辺・最大12）。線は一様・強弱は文字で' },
  timeline: { emoji: '📅', label: 'タイムライン', hint: 'groups＝出来事（heading が時期の文字列・points[0] が出来事・points[1] は補足）。3〜8件・時期は解釈しない' },
  figures: { emoji: '🔢', label: '数値ハイライト', hint: 'groups＝数字カード（heading が見出し・points[0] が数値＋単位・points[1] が引用）。数値＋単位は引用と完全一致・3〜6件' },
  onepage: { emoji: '📄', label: '1枚サマリー', hint: 'title＋要点3（groups[0].points）＋一言（groups[1].points[0]）。描画済みの図を埋め込める' },
  grid9: { emoji: '🔲', label: '9マスシート', hint: 'title＝中央のテーマ・groups[8]＝周囲8マス（heading がカテゴリ名・points が要素2〜5）。マンダラと同じ配置。「マンダラとして開く」で決定的にチャート化' },
  grid9_talk: { emoji: '🎤', label: 'プレゼン構成', hint: 'title＝この発表で伝えたい1つのこと（1文）・groups[8]＝話の流れ（つかみ→結論→なぜ今→前提→具体例→誤解→明日から→まとめ）。各マスの要素は3つ以内。ターゲット・場・時間で流れが変わる' },
  bar: { emoji: '📊', label: '棒グラフ', hint: 'groups＝系列（heading が系列名・1〜3）。points は「ラベル | 値 | 引用」（2〜12点）。値は引用の数値と完全一致・軸は0起点' },
  hbar: { emoji: '📊', label: '横棒グラフ', hint: '棒グラフの横向き。項目名が長いときに' },
  line: { emoji: '📈', label: '折れ線グラフ', hint: '推移。points は「ラベル（時期） | 値 | 引用」（順番どおり）・軸は0起点' },
  pie: { emoji: '🥧', label: '円グラフ', hint: '割合。points の値の合計が100以下（%）。系列は1つ' },
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
/** 322: 辺の識別子（つながり確認で外した辺＝plan.edgeOff に持つ） */
export function edgeKey(from: number, to: number): string {
  return `${from}-${to}`;
}
/** 322: 相手ノードが無い辺の理由（R-101: 黙って描き落とさない） */
export function missingTargetReason(target: string): string {
  return `相手ノード『${target}』がありません（見出し名と同じ表記にすると描けます）`;
}
/** 322: 相手ノード名の照合は NFKC＋空白・記号除去で寄せる（表記ゆれ）。それでも無ければ missing に残す */
export function relationEdgesOf(plan: Pick<VisualPlan, 'groups'>): { edges: RelationEdge[]; dropped: string[]; missing: { point: string; from: number; target: string }[] } {
  const nodes = plan.groups.map((g) => normalizeForMatch(g.heading ?? ''));
  const edges: RelationEdge[] = [];
  const dropped: string[] = [];
  const missing: { point: string; from: number; target: string }[] = [];
  const seen = new Set<string>();
  plan.groups.forEach((g, from) => {
    for (const p of g.points) {
      const m = RELATION_EDGE_RE.exec(p.trim());
      if (!m) {
        dropped.push(p);
        continue;
      }
      const target = m[1].trim();
      const key = normalizeForMatch(target);
      const to = key ? nodes.indexOf(key) : -1;
      if (to < 0) {
        dropped.push(p);
        missing.push({ point: p, from, target });
        continue;
      }
      if (to === from || seen.has(edgeKey(from, to)) || edges.length >= RELATION_MAX_EDGES) {
        dropped.push(p);
        continue;
      }
      seen.add(edgeKey(from, to));
      edges.push({ from, to, label: (m[2] ?? '').trim() });
    }
  });
  return { edges, dropped, missing };
}

/** 320: 相関図の辺＝関連図と同じ解析で **label 必須**。ラベルの無い辺は描かず、dropped に理由つきで残す（画面は赤い印にする） */
export const CORRELATION_LABEL_REQUIRED = '相関図の辺には「相関の向きと強さ」の文字が必要';
export function correlationEdgesOf(plan: Pick<VisualPlan, 'groups'>): { edges: RelationEdge[]; dropped: string[]; unlabeled: string[]; missing: { point: string; from: number; target: string }[] } {
  const base = relationEdgesOf(plan);
  const edges = base.edges.filter((e) => e.label.trim() !== '');
  const unlabeled = base.edges.filter((e) => e.label.trim() === '').map((e) => `→ ${(plan.groups[e.to]?.heading ?? '').trim()}`);
  return { edges, dropped: [...base.dropped, ...unlabeled], unlabeled, missing: base.missing };
}
/** 型に応じた辺（テンプレートと照合が同じ関数を使う）。322: つながり確認で外した辺（plan.edgeOff）は描かない */
export function edgesOfPlan(plan: Pick<VisualPlan, 'type' | 'groups'> & { edgeOff?: string[] }): RelationEdge[] {
  const all = plan.type === 'correlation' ? correlationEdgesOf(plan).edges : relationEdgesOf(plan).edges;
  const off = new Set(plan.edgeOff ?? []);
  return off.size === 0 ? all : all.filter((e) => !off.has(edgeKey(e.from, e.to)));
}
/** 322: 型に応じた「相手ノードが無い辺」（関連図・相関図） */
export function missingTargetsOf(plan: Pick<VisualPlan, 'type' | 'groups'>): { point: string; from: number; target: string }[] {
  if (plan.type !== 'relation' && plan.type !== 'correlation') return [];
  return relationEdgesOf(plan).missing;
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
  // 320: 相関図はラベル無しの辺を「描けない」扱い（label 必須）。ラベルの語句の実在は points 文字列の語句単位チェックが担う
  if (plan.type === 'correlation') {
    const { unlabeled } = correlationEdgesOf(plan);
    for (const u of unlabeled) out[u] = [CORRELATION_LABEL_REQUIRED];
  }
  // 322: 相手ノードが無い辺は描かず、赤い印と同じ場所に理由（黙って描き落とさない・R-101）
  for (const m of missingTargetsOf(plan)) out[m.point] = [missingTargetReason(m.target)];
  // 325: グラフ＝円の合計・系列のラベル並び（描かない理由）。点ごとの値／引用の不一致は graphSeriesOf が捨てて件数（R-101）
  if (isGraphType(plan.type)) for (const [k, v] of Object.entries(graphPlanIssues(plan, sourceText))) out[k] = v;
  return out;
}

/** 323: 同じ種類で切り口の違う候補を最大2つ→合計8まで */
export const VISUAL_MAX_PLANS = 8;
// 324: 関連図は最大8ノード・9マスシートは8マス＝グループ上限を 6→8 に（表・比較などは型ごとの上限が別に効く）
export const VISUAL_MAX_GROUPS = 8;
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
  /** 322: AI が付ける「この内容に向く種類の理由」（40字以内・表示のみ・図には入れない・実在チェックの対象外） */
  why?: string;
  /** 322: つながり確認で外した辺（edgeKey の配列・描かない。プランには残す＝戻せる） */
  edgeOff?: string[];
  /** 325: グラフの単位（任意・軸の文字として描く） */
  unit?: string;
  /** 325: プレゼン構成の「相手が食いつく話題」（AI・表示のみ。チェックしてマスに追記した文字列だけが図に入る） */
  topics?: TalkTopic[];
}
export interface TalkTopic {
  topic: string;
  /** 差し込むマス（0〜8・4以外） */
  position: number;
  /** 元テキストのどの内容と結びつくか（AI が引いた一節。verbatim で実在しなければ「元テキスト外」） */
  basis: string;
}
export const VISUAL_WHY_MAX = 40;
/** 322: edgeOff の検証（"from-to" の形だけ・重複なし） */
export function normalizeEdgeOff(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && /^\d{1,2}-\d{1,2}$/.test(x))));
  return out.length > 0 ? out : undefined;
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

/**
 * 324 §2-2: 実在チェック（語句単位）の対象＝「事実そのもの」の文字列。
 * 関連図・相関図は**ノード名（heading）とタイトル**だけ。辺の行（→ 相手: ラベル）は対象外＝ラベルは活用形で現れることが多く
 * （招く／招き）、語句単位では落ちてしまう。辺の裏付けは 322 の根拠抽出（両端ノードを含む文）で見る（根拠なし＝既定✗・未確認）
 */
export function planFactStrings(plan: Pick<VisualPlan, 'title' | 'groups'> & { type?: VisualType }): string[] {
  if (plan.type === 'relation' || plan.type === 'correlation') {
    const out: string[] = [];
    if (plan.title?.trim()) out.push(plan.title.trim());
    for (const g of plan.groups) if (g.heading?.trim()) out.push(g.heading.trim());
    return out;
  }
  // 325: グラフは事実＝タイトル・系列名・各点のラベル（値と引用は typedPlanIssues＝引用と完全一致・引用が本文に実在）
  if (plan.type && isGraphType(plan.type)) {
    const out: string[] = [];
    if (plan.title?.trim()) out.push(plan.title.trim());
    for (const g of plan.groups) {
      if (g.heading?.trim()) out.push(g.heading.trim());
      for (const p of g.points) {
        const pt = parseGraphPoint(p);
        if (pt?.label) out.push(pt.label);
      }
    }
    return out;
  }
  return collectPlanStrings(plan);
}

export function findForeignPhrases(plan: Pick<VisualPlan, 'title' | 'groups'> & { type?: VisualType }, sourceText: string): string[] {
  const src = normalizeForMatch(sourceText);
  const out: string[] = [];
  for (const s of planFactStrings(plan)) {
    if (foreignTokensOf(s, src).length > 0 && !out.includes(s)) out.push(s);
  }
  return out;
}

/** 文字列→無い内容語（画面で「どの語が無いか」を示す） */
export function findForeignTokens(plan: Pick<VisualPlan, 'title' | 'groups'> & { type?: VisualType }, sourceText: string): Record<string, string[]> {
  const src = normalizeForMatch(sourceText);
  const out: Record<string, string[]> = {};
  for (const s of planFactStrings(plan)) {
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
    // 322: why は表示だけ（図の文字列にも実在チェックにも入れない）
    const why = clean(o.why, VISUAL_WHY_MAX) || undefined;
    // 325: グラフの単位・プレゼン構成の話題（表示のみ）
    const unit = isGraphType(typeRaw) ? clean(o.unit, 20) || undefined : undefined;
    const topics = typeRaw === 'grid9_talk' ? parseTalkTopics(o.topics) : undefined;
    plans.push({ id: `${idPrefix}${i + 1}`, type: typeRaw, title, groups, ...(imagePrompt ? { imagePrompt } : {}), ...(why ? { why } : {}), ...(unit ? { unit } : {}), ...(topics && topics.length > 0 ? { topics } : {}) });
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

// ───────────────────────────────────────────────────────────────────────────
// 327: イメージ画像の生成モード（4種・複数同時）とアスペクト比
//   - API（GPT Image 2.5 flare）は「幅・高さともに16の倍数」なら受ける（2026/9/10 実測）。比ごとの実サイズはここが正本
//   - 重ねる文字はモードごとに決まる（すべてプランの文字列＝実在チェック済み）。④の追記はプロンプトにだけ入り、図の文字にはならない
// ───────────────────────────────────────────────────────────────────────────

export const VISUAL_ASPECTS = ['1:1', '16:9', '4:3', '9:16', '3:4'] as const;
export type VisualAspect = (typeof VISUAL_ASPECTS)[number];
/** API に渡すサイズ（幅・高さとも16の倍数・比は厳密）。1:1・16:9・4:3 は必須 */
export const VISUAL_ASPECT_SIZE: Record<VisualAspect, string> = {
  '1:1': '1024x1024',
  '16:9': '1536x864',
  '4:3': '1408x1056',
  '9:16': '864x1536',
  '3:4': '1056x1408',
};
export const VISUAL_ASPECT_LABEL: Record<VisualAspect, string> = {
  '1:1': '1:1 正方形（SNS・アイコン）',
  '16:9': '16:9 横長（スライド）',
  '4:3': '4:3 横長（資料・印刷）',
  '9:16': '9:16 縦長（ストーリーズ）',
  '3:4': '3:4 縦長（縦資料）',
};
export const VISUAL_ASPECT_DEFAULT: VisualAspect = '16:9';
/** API の制約（サイズは16の倍数） */
export const IMAGE_SIZE_MULTIPLE = 16;
export function isVisualAspect(v: unknown): v is VisualAspect {
  return typeof v === 'string' && (VISUAL_ASPECTS as readonly string[]).includes(v);
}
export function aspectCanvas(a: VisualAspect): { width: number; height: number } {
  const [w, h] = VISUAL_ASPECT_SIZE[a].split('x').map(Number);
  return { width: w, height: h };
}
/** 費用の目安に使うバケット（既存の単価表は 正方形／横長／縦長 の3種） */
export function aspectPricingKey(a: VisualAspect): ImageAspectKey {
  const { width, height } = aspectCanvas(a);
  return width === height ? 'square' : width > height ? 'landscape' : 'portrait';
}

export const VISUAL_IMAGE_MODES = ['simple', 'captioned', 'detailed', 'custom'] as const;
export type VisualImageMode = (typeof VISUAL_IMAGE_MODES)[number];
export const VISUAL_IMAGE_MODE_DEFAULT: VisualImageMode = 'simple';
/** ④ の下敷き（①〜③のどれか）。既定は② */
export const VISUAL_IMAGE_CUSTOM_BASE_DEFAULT: VisualImageMode = 'captioned';
export const VISUAL_IMAGE_MODE_META: Record<VisualImageMode, { emoji: string; label: string; hint: string; style: string }> = {
  simple: { emoji: '⬜️', label: 'シンプル', hint: '文字はタイトルだけ・要素を絞った落ち着いた絵', style: '要素を絞り、主題が一目で伝わる落ち着いた絵にする。背景は単純にし、余白を広く取る。' },
  captioned: { emoji: '🗒', label: '説明つき', hint: 'タイトル＋見出し（最大4）・見出しに対応するモチーフ', style: '主題に加えて、話の柱ごとのモチーフを画面内に配置する。要素は数を絞り、それぞれが見分けられる大きさで描く。' },
  detailed: { emoji: '📚', label: '詳しい説明', hint: 'タイトル＋見出し＋要素（最大10行）・情報量の多い図解調', style: '情報量の多い図解調にする。話の柱ごとのモチーフと、その中身を示す小さなモチーフを整理して並べる。全体の構図は上から下へ視線が流れるように保つ。' },
  custom: { emoji: '✍️', label: '追加プロンプト', hint: '①〜③を下敷きに、書いた指示をそのまま足す', style: '' },
};
/** 重ねる文字の上限（R-101: 超えたら切らずに「ほか n 件」） */
export const OVERLAY_MAX_HEADINGS = 4;
export const OVERLAY_MAX_LINES = 10;
/** 1回の生成の上限（候補数 × モード数） */
export const VISUAL_IMAGE_MAX_BATCH = 6;

/** モードごとに「画像に重ねる文字」を決める（決定的・R-74）。すべてプランの文字列 */
export function imageOverlayLabels(plan: Pick<VisualPlan, 'title' | 'groups'>, mode: VisualImageMode, customBase: VisualImageMode = VISUAL_IMAGE_CUSTOM_BASE_DEFAULT): string[] {
  const effective = mode === 'custom' ? (customBase === 'custom' ? VISUAL_IMAGE_CUSTOM_BASE_DEFAULT : customBase) : mode;
  const title = plan.title.trim();
  if (effective === 'simple') return title ? [title] : [];
  const headings = plan.groups.map((g) => (g.heading ?? '').trim()).filter(Boolean);
  if (effective === 'captioned') {
    const shown = headings.slice(0, OVERLAY_MAX_HEADINGS);
    const rest = headings.length - shown.length;
    return [title, ...shown, ...(rest > 0 ? [grid9OverflowLabel(rest)] : [])].filter(Boolean);
  }
  // detailed: 見出し＋要素（最大10行・超過は「ほか n 件」）
  const lines: string[] = [];
  for (const g of plan.groups) {
    const h = (g.heading ?? '').trim();
    if (h) lines.push(h);
    for (const p of g.points) if (p.trim()) lines.push(p.trim());
  }
  const shown = lines.slice(0, OVERLAY_MAX_LINES);
  const rest = lines.length - shown.length;
  return [title, ...shown, ...(rest > 0 ? [grid9OverflowLabel(rest)] : [])].filter(Boolean);
}

/** 生成する枚数（候補 × 選んだモード）と、上限を超えたときの理由 */
export function imageBatchCount(planCount: number, modes: readonly VisualImageMode[]): number {
  return Math.max(0, planCount) * modes.length;
}
export const IMAGE_BATCH_OVER_REASON = (n: number) => `1回に生成できるのは ${VISUAL_IMAGE_MAX_BATCH} 枚までです（今回は ${n} 枚）。候補かモードを減らしてください`;

export interface VisualImageSettings {
  orientation: VisualOrientation;
  quality: ImageQualityKey;
  /** true＝AI に文字も描かせる（オプトイン）。false（既定）＝絵柄だけ生成し、文字は SVG で重ねる */
  aiText: boolean;
  extraPrompt: string;
  model: VisualImageModelKey;
  /** 327: 生成モード（画面では複数選べる。1リクエスト＝1モード） */
  mode: VisualImageMode;
  /** 327: ④追加プロンプトの下敷き（①〜③） */
  customBase: VisualImageMode;
  /** 327: アスペクト比（API に渡すサイズは VISUAL_ASPECT_SIZE） */
  aspect: VisualAspect;
}
export const VISUAL_IMAGE_DEFAULT_SETTINGS: VisualImageSettings = { orientation: 'landscape', quality: 'medium', aiText: false, extraPrompt: '', model: 'flare', mode: VISUAL_IMAGE_MODE_DEFAULT, customBase: VISUAL_IMAGE_CUSTOM_BASE_DEFAULT, aspect: VISUAL_ASPECT_DEFAULT };

/** 絵柄の定型指示（文字なし）。ガード（image-guards）はサーバで後から連結する（R-69） */
export const VISUAL_IMAGE_BASE_PROMPT =
  '記事の図解に使うイメージ画像。主題が伝わる具体的なモチーフと日常の文脈を、落ち着いた色調のフラットなイラストで描く。余白を広めに取り、上部と下部に文字を重ねられる空間を残す。';
export const VISUAL_IMAGE_NO_TEXT_RULE = '画像内に文字・数字・ロゴ・透かしを一切入れない（文字は後から重ねる）。';

/** 生成プロンプト（ガード連結前）。aiText のときだけプランの文字列を【文字列】として**そのまま**渡す（要約させない） */
export function buildVisualImagePrompt(plan: VisualPlan, settings: Pick<VisualImageSettings, 'aiText' | 'extraPrompt'> & Partial<Pick<VisualImageSettings, 'mode' | 'customBase' | 'aspect'>>): string {
  // 327: モードの定型指示は決定的（同じ入力で同じ文字列・R-74）。④の追記は**プロンプトにだけ**入り、図の文字にはならない
  const mode: VisualImageMode = settings.mode ?? VISUAL_IMAGE_MODE_DEFAULT;
  const customBase: VisualImageMode = settings.customBase ?? VISUAL_IMAGE_CUSTOM_BASE_DEFAULT;
  const styleOf = mode === 'custom' ? VISUAL_IMAGE_MODE_META[customBase === 'custom' ? VISUAL_IMAGE_CUSTOM_BASE_DEFAULT : customBase].style : VISUAL_IMAGE_MODE_META[mode].style;
  const parts = [VISUAL_IMAGE_BASE_PROMPT, `主題: ${plan.title}`];
  if (styleOf) parts.push(`絵柄: ${styleOf}`);
  if (settings.aspect) parts.push(`画面の比率: ${settings.aspect}（この比率いっぱいに構図を取る）`);
  if (plan.imagePrompt?.trim()) parts.push(`絵柄の指示: ${plan.imagePrompt.trim()}`);
  if (mode === 'custom' && settings.extraPrompt.trim()) parts.push(`追加の指示: ${settings.extraPrompt.trim()}`);
  if (settings.aiText) {
    const strings = imageOverlayLabels(plan, mode, customBase);
    parts.push(`【文字列】次の文字列を、この順に、一字一句そのまま画像内に描く（言い換え・要約・追加は禁止）:\n${strings.map((s) => `- ${s}`).join('\n')}`);
  } else {
    parts.push(VISUAL_IMAGE_NO_TEXT_RULE);
  }
  return parts.join('\n');
}

/** 冪等キー（同じプラン・同じ設定の再送は同じ画像）。呼び出し側で userId を前置する */
export function visualImageIdempotencyKey(plan: VisualPlan, settings: VisualImageSettings): string {
  return JSON.stringify({ t: plan.type, ti: plan.title, g: plan.groups, ip: plan.imagePrompt ?? '', o: settings.orientation, q: settings.quality, a: settings.aiText, md: settings.mode, cb: settings.customBase, as: settings.aspect, e: settings.extraPrompt.trim(), m: settings.model });
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
    /** 320: 未保存の結果から作ったとき（保存済みなら sources。後から行ができても自動では紐づけない） */
    unsavedSource?: VisualUnsavedSource;
    /** 323: 提案モードで承認した時刻（JST の文字列）。承認を経ずに描いた（従来モード）ときは無い */
    approvedAt?: string;
    /** 327: どのモードで・どの比で作ったか（キー単位・R-113） */
    imageMode?: VisualImageMode;
    aspect?: VisualAspect;
  };
  size: string;
  model: string;
}

/** 320: 未保存の結果の出どころ（タイトル・字数・時刻・どの画面から） */
export interface VisualUnsavedSource {
  title: string;
  chars: number;
  at: string;
  from: VisualHandoffFrom;
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
  /** 320 */
  unsavedSource?: VisualUnsavedSource | null;
  /** 323 */
  approvedAt?: string | null;
  /** 327 */
  imageMode?: VisualImageMode | null;
  aspect?: VisualAspect | null;
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
      ...(input.unsavedSource && input.sources.length === 0 ? { unsavedSource: input.unsavedSource } : {}),
      ...(input.approvedAt ? { approvedAt: input.approvedAt } : {}),
      ...(input.imageMode ? { imageMode: input.imageMode } : {}),
      ...(input.aspect ? { aspect: input.aspect } : {}),
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

export function buildVisualPlanPrompt(sourceText: string, opts: { maxPlans?: number; types?: readonly VisualType[]; talk?: TalkTarget & { personaLabel: string | null } } = {}): { system: string; prompt: string } {
  const max = opts.maxPlans ?? VISUAL_MAX_PLANS;
  const allowed = opts.types && opts.types.length > 0 ? opts.types : VISUAL_TYPES;
  const typeLines: Record<VisualType, string> = {
    table: '- table: 表。groups＝列（heading が列名・points が各行の値）。2〜4列',
    flow: '- flow: フロー。groups は1つ・points が左から右へ流れる要素（3〜6個・各20字以内）',
    compare: '- compare: 比較。groups＝比較対象（2〜3）・heading が対象名・points が特徴（各24字以内）',
    steps: '- steps: 手順。groups は1つ・points が上から順の手順（3〜8個・各40字以内）',
    concept: '- concept: 概念図。title が中心概念・groups＝枝（heading が枝の名前・points が要素）。2〜6枝',
    relation: '- relation: 関連図。groups＝ノード（heading がノード名・3〜8個）。points は「→ 相手ノード名: 関係ラベル（15字以内）」の形で他ノードへの辺（全体で最大12本）。関係は本文に書かれた因果・順序・相関のみ（推測で辺を増やさない）。ラベルは本文の表現に近い短い語（例: 招く／低下させる／促進する）。悪循環・好循環のように環になる場合は環として辺を張る',
    correlation: '- correlation: 相関図。groups＝要因（heading が要因名・3〜8個）。points は「→ 相手の要因名: 相関の向きと強さ（本文の表記そのまま・必須・例「正の相関（強）」「逆相関」「因果の可能性」）」（全体で最大12本）。**本文に明記された関係のみ**。推測の相関は出さない',
    timeline: '- timeline: タイムライン。groups＝出来事（3〜8件・時系列順）。heading が時期（本文の表記そのまま）・points[0] が出来事（20字以内）・points[1] は補足（任意）',
    figures: '- figures: 数値ハイライト。groups＝数字カード（3〜6件）。heading が見出し（15字以内）・points[0] が数値＋単位（本文の表記そのまま・例「約30%」）・points[1] がその数値を含む本文の引用（60字以内・原文そのまま）',
    onepage: '- onepage: 1枚サマリー。title が主題・groups[0].points が要点3つ（各30字以内）・groups[1].heading は「一言」・groups[1].points[0] が締めの一言（30字以内）',
    grid9: '- grid9: 9マスシート。title が中央のテーマ・groups＝周囲8マス（heading がカテゴリ名・points がそのカテゴリの要素2〜5個・各24字以内）。内容を8つのカテゴリに整理し、カテゴリは重複せず全体を覆う',
    grid9_talk: '- grid9_talk: プレゼン構成の9マス。title は「この発表で伝えたい1つのこと」を1文で。groups＝話の流れ8マス（順に: つかみ／今日の結論／なぜ今この話か／前提のしくみ／具体例・データ／よくある誤解／明日からできること／まとめと次の一歩。案によって役割を入れ替えてよい）。heading はそのマスの見出し・points は本文中の語句で3つ以内',
    bar: '- bar: 棒グラフ。groups＝系列（heading が系列名・1〜3）。points は「ラベル | 値 | 引用」の形（2〜12点）。値は本文の表記そのまま（例「約30%」「1,200人」）・引用はその値を含む本文の連続した一節（60字以内・原文そのまま）',
    hbar: '- hbar: 横棒グラフ。bar と同じ形（項目名が長いとき）',
    line: '- line: 折れ線グラフ。groups＝系列（1〜3）。points は「ラベル（時期） | 値 | 引用」（時系列順・2〜12点）。値・引用の規則は bar と同じ',
    pie: '- pie: 円グラフ。groups は1つ。points は「ラベル | 値（%） | 引用」（2〜8点・合計100以下）。値・引用の規則は bar と同じ',
    image: '- image: イメージ画像。heading／points は画像に重ねる短い文字（合計4つ以内・各20字以内）。imagePrompt に絵柄の指示（文字は書かない）',
  };
  // 325: プレゼン設計モード（grid9_talk）＝ターゲット・場・時間に合わせた「構成の異なる案を2〜3つ」＋関連話題
  const talkSection = opts.talk
    ? `- 【プレゼン設計】誰に: ${opts.talk.personaLabel ?? '一般'}／どこで: ${opts.talk.venue}／時間: ${opts.talk.minutes}分。grid9_talk は**構成の異なる案を2〜3つ**（例: 困りごとから入る／結論から入る／時系列で追う）。中央（title）は1文＝この発表で相手に持ち帰ってほしい1つのことだけ。各マスの要素は3つ以内（スライド1枚に載る量）。専門用語は相手に合わせて**本文にある言い換え**を使う（無ければそのまま）。誇張・断定・不安を煽る表現を使わない。各案に topics（この相手が食いつく話題・3〜5件）: { "topic": "20字以内", "position": 差し込むマス（0〜8・4以外）, "basis": "結びつく本文の一節（原文そのまま・40字以内）" }。話題の切り口は自由だが**事実は本文の範囲**（本文に無い事実・数字・事例を作らない）
`
    : '';
  const system = 'あなたは医療記事の編集者兼インフォグラフィックデザイナーです。記事の本文から「図解にすると理解が深まる構造」を見つけ、図解の設計データを作ります。図解に入る文字は本文に実際に書かれている語句だけを使います（言い換え・要約・補足・創作は禁止）。';
  const prompt = `以下の本文から、図解の候補を最大${max}個提案してください。

# 型（type は次の${allowed.length}種のみ。これ以外は出さない）
${allowed.map((t) => typeLines[t]).join('\n')}

# 絶対に守ること
- title・heading・points の文字列は、**本文にそのまま書かれている語句**だけを使う（本文からの抜き出し。言い換え・要約・数値の丸め・単位の追加を禁止）
- ビフォーアフター（治療前後・効果の対比・症状の変化）の図解は**提案しない**。type に beforeafter を使わない
- 効果効能の保証・誇大表現・患者の体験談的表現を図解に入れない
- 図解に向く構造が本文に無ければ少なくてよい（無理に作らない）
- 各候補に why（この内容にその型が向く理由・40字以内・表示にだけ使う）を付ける
- 図の文字に LaTeX・数式記法（$…$、\\rightarrow 等）を入れない。矢印は「→」、記号はそのままの文字で書く
- 同じ型でも**切り口の違う候補を最大2つ**まで出してよい（例: 関連図＝物質の変換の流れ／時間帯と行動の関係）。切り口が同じものを重ねない
${talkSection}
# 本文
${sourceText.slice(0, VISUAL_SOURCE_MAX_CHARS)}

# 出力フォーマット（必ずこのJSONのみ。前置き・コードフェンス禁止）
{ "visuals": [ { "type": "${allowed.join('|')}", "why": "この内容に向く理由（40字以内）", "title": "本文中の語句", "groups": [ { "heading": "本文中の語句（省略可）", "points": ["本文中の語句", "…"] } ], "imagePrompt": "image のときだけ・絵柄の指示", "unit": "グラフのときだけ・単位（任意）", "topics": [ { "topic": "grid9_talk のときだけ", "position": 0, "basis": "本文の一節" } ] } ] }`;
  return { system, prompt };
}


// ───────────────────────────────────────────────────────────────────────────
// 320: 生成結果から直接（🔭DR・🗂分析・⚖比較の列）→ 種類を選んで 315 を開く。未保存は一回限りキー（R-121）・自動 STEP1（?autoplan=1）
// ───────────────────────────────────────────────────────────────────────────

export const VISUALS_HANDOFF_KEY = 'visuals-handoff';
export const VISUALS_FROM_PARAM = 'handoff';
export const VISUALS_AUTOPLAN_PARAM = 'autoplan';
export type VisualHandoffFrom = 'deepresearch' | 'text_analysis' | 'compare';
export function isVisualHandoffFrom(v: unknown): v is VisualHandoffFrom {
  return v === 'deepresearch' || v === 'text_analysis' || v === 'compare';
}
export interface VisualsHandoff {
  title: string;
  text: string;
  from: VisualHandoffFrom;
  at: string;
}
export function parseVisualsHandoff(raw: unknown): VisualsHandoff | null {
  let o: Record<string, unknown> | null = null;
  try {
    o = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : ((raw ?? null) as Record<string, unknown> | null);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  if (text.length < 20) return null;
  if (!isVisualHandoffFrom(o.from)) return null;
  return { title: typeof o.title === 'string' ? o.title.slice(0, 120) : '', text: text.slice(0, VISUAL_SOURCE_MAX_CHARS), from: o.from, at: typeof o.at === 'string' ? o.at : '' };
}

/** 種類ダイアログの既定（関連図・表・画像）。相関図は本文に明記された相関があるときだけ成立し空振りしやすいので既定に入れない */
export const VISUAL_QUICK_DEFAULT_TYPES: readonly VisualType[] = ['relation', 'table', 'image'];
/** 種類ダイアログの一言（何に向くか）と目安（画像は費用・他はコード描画で無料） */
export const VISUAL_TYPE_PICKER_NOTE: Record<VisualType, string> = {
  image: '主題を伝える1枚絵（GPT Image 2.5・文字は重ねる）',
  table: '項目×値の整理（列と行）',
  flow: '左から右へ流れる工程・順序',
  compare: '2〜3つの対象の特徴を並べる',
  steps: '上から順の手順（3〜8）',
  concept: '中心概念と枝（分類・構成）',
  relation: '要素どうしのつながり（円周・辺にラベル）',
  correlation: '要因どうしの相関（向きと強さを文字で・本文に明記された関係のみ）',
  timeline: '時期と出来事の並び',
  figures: '数値の見せ場（引用と完全一致）',
  onepage: 'タイトル＋要点3＋一言の1枚',
  grid9: '中央のテーマ＋8カテゴリで思考・情報を整理（マンダラとして開ける）',
  grid9_talk: 'プレゼンの構成（中央＝伝えたい1つのこと＋話の流れ8マス・ターゲット別）',
  bar: '項目ごとの量の比較（数値は元テキストの引用どおり・0起点）',
  hbar: '項目名が長いときの量の比較（横向き）',
  line: '時期ごとの推移（0起点）',
  pie: '割合（合計100以下）',
};
export const VISUAL_TYPE_PICKER_ORDER: readonly VisualType[] = ['image', 'table', 'flow', 'compare', 'steps', 'concept', 'relation', 'correlation', 'timeline', 'figures', 'onepage', 'grid9', 'grid9_talk', 'bar', 'hbar', 'line', 'pie'];

export function normalizeVisualTypes(v: readonly unknown[]): VisualType[] {
  const out: VisualType[] = [];
  for (const t of VISUAL_TYPE_PICKER_ORDER) if (v.includes(t) && !out.includes(t)) out.push(t);
  return out;
}

/** 315 を開く URL（保存済み＝?scope=&id=／未保存＝?from=handoff）。types と autoplan=1 を付ける（決定的） */
export function visualsHrefFor(input: { saved?: { scope: string; id: string } | null; types: readonly VisualType[]; autoplan?: boolean }): string {
  const sp = new URLSearchParams();
  if (input.saved) {
    sp.set('scope', input.saved.scope);
    sp.set('id', input.saved.id);
  } else {
    sp.set('from', VISUALS_FROM_PARAM);
  }
  const types = normalizeVisualTypes(input.types);
  if (types.length > 0) sp.set('types', types.join(','));
  if (input.autoplan !== false) sp.set(VISUALS_AUTOPLAN_PARAM, '1');
  return `/dashboard/visuals?${sp.toString()}`;
}

/** 320 §3-5: 「AIに文字も描かせる」の前回の選択（端末ごと・初期既定はオフ） */
export const VISUAL_AI_TEXT_STORAGE_KEY = 'visuals_ai_text';
export function parseStoredAiText(raw: unknown): boolean {
  return raw === '1';
}


// ───────────────────────────────────────────────────────────────────────────
// 322: 「つながり確認」（関連図・相関図）＝辺の一覧と根拠の決定的抽出（AI なし）
// ───────────────────────────────────────────────────────────────────────────

export interface RelationEdgeRow {
  key: string;
  from: string;
  to: string;
  label: string;
  /** 元テキストから from・to（・ラベル）の語句を含む文を決定的に抜く。無ければ null（描くかは院長の判断） */
  evidence: string | null;
  /** ✓（plan.edgeOff に無い） */
  on: boolean;
}
export const EDGE_EVIDENCE_MAX = 120;

/** 文に分ける（317 の extractCitations と同じ切り方・決定的） */
export function splitSentences(text: string): string[] {
  return (text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/(?<=[。！？!?])\s*|\n+/)
    .map((x) => x.replace(/^[#>\-*\s]+/, '').trim())
    .filter(Boolean);
}

/** from・to（・ラベルの内容語）を含む最初の文。ラベル込みで見つからなければ from・to だけで探す */
export function edgeEvidence(sourceText: string, from: string, to: string, label: string): string | null {
  const sentences = splitSentences(sourceText);
  const nf = normalizeForMatch(from);
  const nt = normalizeForMatch(to);
  if (!nf || !nt) return null;
  const labelTokens = tokenizeContentWords(label);
  const pick = (needLabel: boolean) => sentences.find((s) => {
    const ns = normalizeForMatch(s);
    if (!ns.includes(nf) || !ns.includes(nt)) return false;
    return !needLabel || labelTokens.length === 0 || labelTokens.some((t) => ns.includes(t));
  });
  const hit = (labelTokens.length > 0 ? pick(true) : undefined) ?? pick(false);
  if (!hit) return null;
  return hit.length > EDGE_EVIDENCE_MAX ? `${hit.slice(0, EDGE_EVIDENCE_MAX)}…` : hit;
}

/** 辺の一覧（編集のたびに再計算・決定的）。相手ノードが無い辺は含めない（赤い印側に理由が出る） */
export function relationEdgeRows(plan: Pick<VisualPlan, 'type' | 'groups' | 'edgeOff'>, sourceText: string): RelationEdgeRow[] {
  if (plan.type !== 'relation' && plan.type !== 'correlation') return [];
  const nodes = plan.groups.map((g) => (g.heading ?? '').trim());
  const all = plan.type === 'correlation' ? correlationEdgesOf(plan).edges : relationEdgesOf(plan).edges;
  const off = new Set(plan.edgeOff ?? []);
  return all.map((e) => ({
    key: edgeKey(e.from, e.to),
    from: nodes[e.from] ?? '',
    to: nodes[e.to] ?? '',
    label: e.label,
    evidence: edgeEvidence(sourceText, nodes[e.from] ?? '', nodes[e.to] ?? '', e.label),
    on: !off.has(edgeKey(e.from, e.to)),
  }));
}

/** 「根拠のない辺が n 本あります」（✓の辺だけ数える。描画は止めない＝院長の判断） */
export function edgesWithoutEvidenceCount(rows: readonly RelationEdgeRow[]): number {
  return rows.filter((r) => r.on && r.evidence === null).length;
}
export function edgesWithoutEvidenceLabel(n: number): string | null {
  return n > 0 ? `根拠のない辺が ${n} 本あります（元テキストに両方のノードを含む文が見つかりません。描くかはご判断ください）` : null;
}


// ───────────────────────────────────────────────────────────────────────────
// 323: 提案モード（候補カード＝決定的な「構成」説明文・実在 k/n・承認・「赤い部分を外して承認」・一括生成の目安）
// ───────────────────────────────────────────────────────────────────────────

export const VISUALS_MODE_PARAM = 'mode';
export const VISUALS_MODE_FORM = 'form';

function joinNames(list: readonly string[], max = 4): string {
  const a = list.map((s) => s.trim()).filter(Boolean);
  if (a.length <= max) return a.join('／');
  return `${a.slice(0, max).join('／')} ほか${a.length - max}`;
}

/** 「構成」の説明文（AI ではなくプランから決定的に組む・R-74。同じプランで同じ文） */
export function planStructureText(plan: Pick<VisualPlan, 'type' | 'title' | 'groups' | 'imagePrompt' | 'edgeOff' | 'unit'>, sourceText = ''): string {
  const g = plan.groups;
  const heads = g.map((x) => (x.heading ?? '').trim());
  switch (plan.type) {
    case 'table': {
      const rows = Math.max(0, ...g.map((x) => x.points.length));
      return `列 ${joinNames(heads)}・行 ${rows} 件`;
    }
    case 'flow': {
      const pts = g[0]?.points ?? [];
      return `${joinNames(pts, 6).replace(/／/g, ' → ')} の ${pts.length} 段`;
    }
    case 'compare': {
      const items = Math.max(0, ...g.map((x) => x.points.length));
      return `${joinNames(heads).replace(/／/g, ' と ')} を ${items} 項目で`;
    }
    case 'steps': {
      const n = g.reduce((acc, x) => acc + x.points.length, 0);
      return `${n} 手順${heads.some(Boolean) ? `（${joinNames(heads.filter(Boolean))}）` : ''}`;
    }
    case 'concept':
      return `中心 ${plan.title.trim() || '（無題）'}・枝 ${g.length} 本（${joinNames(heads)}）`;
    case 'relation':
    case 'correlation': {
      const nodes = heads.filter(Boolean);
      const edges = edgesOfPlan(plan);
      const edgeText = edges.map((e) => `${heads[e.from]}→${heads[e.to]}${e.label ? `（${e.label}）` : ''}`);
      return `${joinNames(nodes)} の ${nodes.length} 点を中心に、${edges.length > 0 ? `${joinNames(edgeText, 6)} の ${edges.length} 本のつながり` : 'つながりなし'}`;
    }
    case 'timeline':
      return `${g.length} 点（${joinNames(heads)}）`;
    case 'figures':
      return `${g.length} 個の数値（${joinNames(g.map((x) => x.points[0] ?? ''))}）`;
    case 'onepage':
      return `要点 ${(g[0]?.points ?? []).length}＋一言${g[1]?.points[0] ? `「${g[1].points[0]}」` : 'なし'}`;
    case 'image': {
      const lines = g.reduce((acc, x) => acc + (x.heading ? 1 : 0) + x.points.length, 0);
      return `絵柄: ${(plan.imagePrompt ?? '').trim() || '（指示なし）'}／重ねる文字: ${lines} 行`;
    }
    case 'grid9': {
      const cells = g.filter((x) => (x.heading ?? '').trim());
      return `中央 ${plan.title.trim() || '（無題）'}・カテゴリ ${cells.length}/${GRID9_CELLS}（${joinNames(cells.map((x) => x.heading ?? ''), 8)}）`;
    }
    case 'grid9_talk': {
      const cells = g.filter((x) => (x.heading ?? '').trim());
      return `伝えたいこと「${plan.title.trim() || '（無題）'}」・話の流れ ${cells.length}/${GRID9_CELLS}（${joinNames(cells.map((x) => x.heading ?? ''), 8).replace(/／/g, ' → ')}）`;
    }
    case 'bar':
    case 'hbar':
    case 'line':
    case 'pie': {
      const gs = graphSeriesOf(plan as VisualPlan, sourceText);
      const kind = plan.type === 'pie' ? '円' : plan.type === 'line' ? '折れ線' : plan.type === 'hbar' ? '横棒' : '棒';
      return `${kind}グラフ・系列 ${gs.series.length}（${joinNames(gs.series.map((s) => s.name))}）・点 ${gs.series[0]?.points.length ?? 0}${plan.unit ? `・単位 ${plan.unit}` : ''}${gs.dropped.length > 0 ? `・捨てた点 ${gs.dropped.length}` : ''}`;
    }
    default:
      return '';
  }
}

/** 「元テキストに実在 k/n」（n＝図に入る文字列の数・k＝実在チェックを通った数） */
export function planEvidenceCount(plan: VisualPlan, check: Pick<PlanCheck, 'foreign'>): { ok: number; total: number } {
  // 324: 関連図・相関図はノード名だけを数える（辺は根拠で裏付け）
  const total = new Set(planFactStrings(plan)).size;
  const bad = new Set(check.foreign).size;
  return { ok: Math.max(0, total - bad), total };
}

export const APPROVE_REJECT_EMPTY = '承認できません（タイトルと要素を入れてください）';
export function approvalState(check: PlanCheck): { enabled: boolean; reason: string | null } {
  if (check.empty) return { enabled: false, reason: APPROVE_REJECT_EMPTY };
  if (check.foreign.length > 0) return { enabled: false, reason: `承認できません（元テキストに無い語句: ${check.foreign.join('／')}）` };
  if (check.banned.length > 0) return { enabled: false, reason: `承認できません（医療広告のNG表現: ${check.banned.map((b) => b.matched).join('／')}）` };
  return { enabled: true, reason: null };
}

/** 種類ごとの最低要件（外した結果これを割ると承認できない・R-101） */
export function typeMinRequirement(plan: Pick<VisualPlan, 'type' | 'title' | 'groups' | 'edgeOff'>): string | null {
  const g = plan.groups;
  const pts = (i: number) => g[i]?.points.length ?? 0;
  if (!plan.title.trim()) return 'タイトルが必要です';
  switch (plan.type) {
    case 'table': return g.length >= 2 && g.every((x) => x.points.length > 0) ? null : '表は2列以上・各列に値が必要です';
    case 'flow': return pts(0) >= 3 ? null : 'フローは3つ以上の要素が必要です';
    case 'compare': return g.length >= 2 && g.every((x) => x.points.length > 0) ? null : '比較は2つ以上の対象と各対象の特徴が必要です';
    case 'steps': return g.reduce((a, x) => a + x.points.length, 0) >= 3 ? null : '手順は3つ以上必要です';
    case 'concept': return g.length >= 2 && g.every((x) => (x.heading ?? '').trim()) ? null : '概念図は2本以上の枝（見出し）が必要です';
    case 'relation':
    case 'correlation': {
      const nodes = g.filter((x) => (x.heading ?? '').trim()).length;
      return nodes >= 2 && edgesOfPlan(plan).length >= 1 ? null : '関連図・相関図は2つ以上のノードと1本以上のつながりが必要です';
    }
    case 'timeline': return g.length >= TIMELINE_MIN_ITEMS ? null : `時系列は${TIMELINE_MIN_ITEMS}点以上必要です`;
    case 'figures': return g.length >= FIGURES_MIN && g.every((x) => x.points.length >= 2) ? null : `数値は${FIGURES_MIN}個以上（数値と引用）必要です`;
    case 'onepage': return pts(0) >= ONEPAGE_POINTS && !!g[1]?.points[0] ? null : `1枚サマリーは要点${ONEPAGE_POINTS}つと一言が必要です`;
    case 'image': return g.some((x) => (x.heading ?? '').trim() || x.points.length > 0) ? null : 'イメージは重ねる文字が1つ以上必要です';
    case 'grid9': return g.filter((x) => (x.heading ?? '').trim()).length >= GRID9_MIN_CELLS ? null : `9マスシートはカテゴリ（マス）が${GRID9_MIN_CELLS}つ以上必要です`;
    case 'grid9_talk': return g.filter((x) => (x.heading ?? '').trim()).length >= GRID9_MIN_CELLS ? null : `プレゼン構成は話の流れ（マス）が${GRID9_MIN_CELLS}つ以上必要です`;
    case 'bar':
    case 'hbar':
    case 'line':
    case 'pie': {
      const gs = graphSeriesOf(plan as VisualPlan, '');
      if (gs.series.length === 0) return 'グラフは系列（見出し）が1つ以上必要です';
      if (plan.type === 'pie' && gs.series.length > 1) return '円グラフの系列は1つです';
      if (gs.series.some((s) => s.points.length < 2)) return `グラフは各系列に${GRAPH_MIN_POINTS}点以上（値と引用が一致する点）が必要です`;
      return null;
    }
    default: return null;
  }
}

/**
 * 「赤い部分を外して承認」＝実在しない語句・NG表現の断片を**決定的に**除く（AI なし）。
 * 要素（points）は該当行を消す。見出しが該当ならそのグループごと消す。タイトルが該当なら外せない（直してもらう）
 */
export function stripForeign(plan: VisualPlan, check: PlanCheck): { ok: true; plan: VisualPlan; removed: string[] } | { ok: false; reason: string } {
  const bad = new Set<string>([...check.foreign, ...check.banned.map((b) => b.text)]);
  if (bad.size === 0) return { ok: true, plan, removed: [] };
  if (bad.has(plan.title.trim())) return { ok: false, reason: 'タイトルに元テキストに無い語句があるため外せません（タイトルを直してください）' };
  const removed: string[] = [];
  const groups = plan.groups
    .filter((g) => {
      const h = (g.heading ?? '').trim();
      if (h && bad.has(h)) {
        removed.push(h, ...g.points.map((p) => p.trim()).filter(Boolean));
        return false;
      }
      return true;
    })
    .map((g) => ({ ...g, points: g.points.filter((p) => { const t = p.trim(); if (bad.has(t)) { removed.push(t); return false; } return true; }) }))
    .filter((g) => (g.heading ?? '').trim() || g.points.length > 0);
  const next: VisualPlan = { ...plan, groups };
  const req = typeMinRequirement(next);
  if (req) return { ok: false, reason: `外すと最低要件を満たしません（${req}）。「詳しく直す」で直してください` };
  return { ok: true, plan: next, removed: Array.from(new Set(removed)) };
}

/** 一括生成の内訳と目安（コード描画は無料・画像は 315 の単価） */
export function bulkEstimate(plans: readonly VisualPlan[], settings: Pick<VisualImageSettings, 'quality' | 'aiText' | 'extraPrompt'> & Partial<Pick<VisualImageSettings, 'customBase' | 'aspect'>>, orientation: VisualOrientation, modes: readonly VisualImageMode[] = [VISUAL_IMAGE_MODE_DEFAULT]): { renders: number; images: number; usd: number; seconds: number } {
  let renders = 0;
  let images = 0;
  let usd = 0;
  for (const p of plans) {
    if (p.type === 'image') {
      // 327: 1候補につき「選んだモードの数」だけ生成する。比が費用のバケットを決める
      const bucket = settings.aspect ? aspectPricingKey(settings.aspect) : orientation;
      for (const mode of modes) {
        images += 1;
        usd += estimateImageCost(settings.quality, bucket, buildVisualImagePrompt(p, { ...settings, mode }).length).usd;
      }
    } else {
      renders += 1;
    }
  }
  return { renders, images, usd, seconds: renders * 6 + images * 40 };
}
export function bulkConfirmLabel(e: { renders: number; images: number }): string {
  return `コード描画 ${e.renders} 件（無料）・画像 ${e.images} 枚`;
}


// ───────────────────────────────────────────────────────────────────────────
// 324: 9マスシート（grid9）・関連図の辺の既定（根拠なし＝✗）・環の検出と並べ替え・辺なしノード
// ───────────────────────────────────────────────────────────────────────────

export const GRID9_CELLS = 8;
export const GRID9_MIN_CELLS = 2;
/** 各マスに描く要素の上限（超過は「ほか n 件」・R-101） */
export const GRID9_MAX_POINTS = 5;
export function grid9OverflowLabel(n: number): string {
  return `ほか ${n} 件`;
}
export const GRID9_OVERFLOW_RE = /^ほか \d+ 件$/;
export const RELATION_LOOSE_PREFIX = 'つながり未指定:';

/** 9マスシートのプラン → マンダラの各マス（中央＝title・周囲8＝heading／本文＝要素を改行で・配置は MANDALA_OUTLINE_POSITIONS＝マンダラと同じ）。AI なし・決定的 */
export function planToMandalaCells(plan: Pick<VisualPlan, 'title' | 'groups'>): { center: { title: string; body: string }; cells: { position: number; title: string; body: string }[] } {
  const groups = plan.groups.filter((g) => (g.heading ?? '').trim()).slice(0, GRID9_CELLS);
  return {
    center: { title: plan.title.trim(), body: '' },
    cells: groups.map((g, i) => ({ position: MANDALA_OUTLINE_POSITIONS[i], title: (g.heading ?? '').trim(), body: g.points.map((p) => p.trim()).filter(Boolean).join('\n') })),
  };
}

/** 324 §2-2: 抽出直後の既定＝根拠のない辺は✗（edgeOff に入れる・院長が✓にすれば描ける）。既存の edgeOff は保つ */
export function applyEdgeDefaults(plan: VisualPlan, sourceText: string): VisualPlan {
  if (plan.type !== 'relation' && plan.type !== 'correlation') return plan;
  const off = new Set(plan.edgeOff ?? []);
  const nodes = plan.groups.map((g) => (g.heading ?? '').trim());
  const all = plan.type === 'correlation' ? correlationEdgesOf(plan).edges : relationEdgesOf(plan).edges;
  for (const e of all) if (edgeEvidence(sourceText, nodes[e.from] ?? '', nodes[e.to] ?? '', e.label) === null) off.add(edgeKey(e.from, e.to));
  return off.size > 0 ? { ...plan, edgeOff: Array.from(off).sort() } : plan;
}

/** つながりの要約「n 本（うち未確認 m 本）」（✓✗に関わらず数える） */
export function relationEdgeSummary(rows: readonly RelationEdgeRow[]): { total: number; unconfirmed: number } {
  return { total: rows.length, unconfirmed: rows.filter((r) => r.evidence === null).length };
}

/**
 * 324 §2-4: ノードの並び（決定的）。辺のあるノードを円周へ、環（from→to を辿って戻る）があれば環の順に。辺の無いノードは loose。
 * すべてに辺が無ければ従来どおり全ノードを円周に
 */
export function relationNodeOrder(plan: Pick<VisualPlan, 'type' | 'groups' | 'edgeOff'>): { circle: number[]; loose: number[] } {
  const n = plan.groups.length;
  const edges = edgesOfPlan(plan);
  if (edges.length === 0) return { circle: Array.from({ length: n }, (_, i) => i), loose: [] };
  const connected = new Set<number>();
  for (const e of edges) { connected.add(e.from); connected.add(e.to); }
  const adj = new Map<number, number[]>();
  for (const e of edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e.to].sort((a, b) => a - b));
  // 環の検出: 各始点から DFS（訪問順は index 昇順）。最初に見つかった最長の環を採用（決定的）
  let best: number[] = [];
  const findCycle = (start: number) => {
    const stack: number[] = [start];
    const onPath = new Set<number>([start]);
    const dfs = (v: number): number[] | null => {
      for (const w of adj.get(v) ?? []) {
        if (w === start) return [...stack];
        if (onPath.has(w)) continue;
        stack.push(w); onPath.add(w);
        const r = dfs(w);
        if (r) return r;
        stack.pop(); onPath.delete(w);
      }
      return null;
    };
    return dfs(start);
  };
  for (const s of Array.from(connected).sort((a, b) => a - b)) {
    const c = findCycle(s);
    if (c && c.length > best.length) best = c;
  }
  const rest = Array.from(connected).filter((i) => !best.includes(i)).sort((a, b) => a - b);
  const loose = Array.from({ length: n }, (_, i) => i).filter((i) => !connected.has(i));
  return { circle: [...best, ...rest], loose };
}


// ───────────────────────────────────────────────────────────────────────────
// 325: グラフ（bar／hbar／line／pie）＝数値は元テキストの引用と完全一致・軸は0起点・色で意味を持たせない
// 点は「ラベル | 値 | 引用」の1行（既存の編集フォームで直せる）
// ───────────────────────────────────────────────────────────────────────────

export const GRAPH_TYPES: readonly VisualType[] = ['bar', 'hbar', 'line', 'pie'];
export function isGraphType(t: unknown): t is 'bar' | 'hbar' | 'line' | 'pie' {
  return t === 'bar' || t === 'hbar' || t === 'line' || t === 'pie';
}
export const GRAPH_MIN_POINTS = 2;
export const GRAPH_MAX_POINTS = 12;
export const GRAPH_MAX_SERIES = 3;
export const PIE_MAX_TOTAL = 100;

export interface GraphPoint {
  label: string;
  /** 本文の表記そのまま（例「約30%」「1,200人」） */
  value: string;
  /** 数値（value から決定的に読む） */
  num: number;
  evidence: string;
}
export interface GraphSeries {
  name: string;
  points: GraphPoint[];
}

/** 「ラベル | 値 | 引用」を読む（区切りは | か ｜）。形が違えば null */
export function parseGraphPoint(line: string): { label: string; value: string; evidence: string } | null {
  const parts = (line ?? '').split(/\s*[|｜]\s*/).map((x) => x.trim());
  if (parts.length < 2) return null;
  const [label, value, evidence = ''] = parts;
  if (!label || !value) return null;
  return { label, value, evidence };
}
/** 値の文字列から数値を読む（全角→半角・カンマ除去・先頭の「約」等は無視・最初の数値）。無ければ null */
export function graphNumberOf(value: string): number | null {
  const s = (value ?? '').normalize('NFKC').replace(/,/g, '');
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}
export function graphPointLine(p: { label: string; value: string; evidence: string }): string {
  return `${p.label} | ${p.value} | ${p.evidence}`;
}

/**
 * 系列と点（検証つき・決定的）。値が引用に無い／引用が本文に無い／数値でない点は捨てて理由に残す（R-101）。
 * sourceText が空なら「引用が本文に実在」は見ない（最低要件の判定・構成文用）
 */
export function graphSeriesOf(plan: Pick<VisualPlan, 'groups'>, sourceText: string): { series: GraphSeries[]; dropped: { point: string; reason: string }[] } {
  const src = sourceText ? normalizeForMatch(sourceText) : null;
  const series: GraphSeries[] = [];
  const dropped: { point: string; reason: string }[] = [];
  for (const g of plan.groups.slice(0, GRAPH_MAX_SERIES)) {
    const name = (g.heading ?? '').trim();
    const points: GraphPoint[] = [];
    for (const line of g.points) {
      const pt = parseGraphPoint(line);
      if (!pt) { dropped.push({ point: line, reason: '「ラベル | 値 | 引用」の形ではありません' }); continue; }
      const num = graphNumberOf(pt.value);
      if (num === null) { dropped.push({ point: line, reason: `値が数値として読めません: ${pt.value}` }); continue; }
      if (!pt.evidence) { dropped.push({ point: line, reason: '引用がありません' }); continue; }
      if (!normalizeForMatch(pt.evidence).includes(normalizeForMatch(pt.value))) { dropped.push({ point: line, reason: `引用と完全一致しない数値: ${pt.value}` }); continue; }
      if (src && !src.includes(normalizeForMatch(pt.evidence))) { dropped.push({ point: line, reason: `引用が本文に無い: ${pt.evidence.slice(0, 20)}` }); continue; }
      if (points.length >= GRAPH_MAX_POINTS) { dropped.push({ point: line, reason: `点は${GRAPH_MAX_POINTS}個までです` }); continue; }
      points.push({ label: pt.label, value: pt.value, num, evidence: pt.evidence });
    }
    if (name || points.length > 0) series.push({ name: name || `系列${series.length + 1}`, points });
  }
  return { series, dropped };
}

/** 325: 描くのは引用と本文で裏が取れた点だけ（決定的・R-127 と同じ考え方）。捨てた点はカードに件数で出る */
export function filterGraphPlan(plan: VisualPlan, sourceText: string): VisualPlan {
  if (!isGraphType(plan.type)) return plan;
  const { series } = graphSeriesOf(plan, sourceText);
  const names = new Set<string>();
  const groups = plan.groups.slice(0, GRAPH_MAX_SERIES).map((g, i) => {
    const name = (g.heading ?? '').trim() || `系列${i + 1}`;
    names.add(name);
    const s = series.find((x) => x.name === name);
    return { ...g, points: (s?.points ?? []).map((p) => graphPointLine(p)) };
  }).filter((g) => g.points.length > 0);
  return { ...plan, groups };
}

export const PIE_TOTAL_REASON = (total: number) => `円グラフの合計が100を超えています（${total}）。割合として成立しないため描きません`;
export const GRAPH_ALIGN_REASON = '系列ごとにラベルの並びが違うため描きません（軸がずれます。同じラベルを同じ順に）';
/** 描かない理由（円の合計・系列のラベル並び）。キーは赤い印の文字列 */
export function graphPlanIssues(plan: Pick<VisualPlan, 'type' | 'groups'>, sourceText: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const { series } = graphSeriesOf(plan, sourceText);
  if (plan.type === 'pie' && series[0]) {
    const total = series[0].points.reduce((n, p) => n + p.num, 0);
    if (total > PIE_MAX_TOTAL + 1e-9) out[`合計 ${total}`] = [PIE_TOTAL_REASON(total)];
  }
  if (series.length >= 2) {
    const first = series[0].points.map((p) => p.label).join('|');
    if (series.some((s) => s.points.map((p) => p.label).join('|') !== first)) out['系列のラベル'] = [GRAPH_ALIGN_REASON];
  }
  return out;
}

/** 軸の目盛り（0起点・決定的）。負値を含むときは最小値を明示（切り取りで印象を変えない） */
export function graphAxis(series: readonly GraphSeries[]): { min: number; max: number; ticks: number[]; zeroBased: boolean } {
  const values = series.flatMap((s) => s.points.map((p) => p.num));
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);
  const nice = (v: number) => {
    if (v === 0) return 0;
    const exp = Math.pow(10, Math.floor(Math.log10(Math.abs(v))));
    const f = Math.abs(v) / exp;
    const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return Math.sign(v) * step * exp;
  };
  const max = nice(rawMax) || 1;
  const min = rawMin < 0 ? nice(rawMin) : 0;
  const ticks: number[] = [];
  const step = (max - min) / 4;
  for (let i = 0; i <= 4; i++) ticks.push(Math.round((min + step * i) * 100) / 100);
  return { min, max, ticks, zeroBased: min === 0 };
}
/** 目盛りの文字（整数はそのまま・小数は2桁まで） */
export function tickLabel(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// ───────────────────────────────────────────────────────────────────────────
// 325: プレゼン設計モード（grid9_talk）＝ターゲット・場・時間、時間配分（決定的）、関連話題の根拠
// ───────────────────────────────────────────────────────────────────────────

export const TALK_VENUES = ['院内勉強会', '患者向け説明会', '同業者向け講演', '一般向けセミナー'] as const;
export type TalkVenue = (typeof TALK_VENUES)[number];
export const TALK_MINUTES = [5, 10, 20, 40] as const;
export type TalkMinutes = (typeof TALK_MINUTES)[number];
export const TALK_DEFAULT: TalkTarget = { persona: null, venue: '一般向けセミナー', minutes: 10 };
export interface TalkTarget {
  /** 317 のペルソナ（PersonaStyleKey）。null＝一般 */
  persona: string | null;
  venue: TalkVenue;
  minutes: TalkMinutes;
}
export function parseTalkTarget(v: unknown): TalkTarget {
  const o = (v ?? {}) as Record<string, unknown>;
  const persona = typeof o.persona === 'string' && o.persona.trim() ? o.persona.trim().slice(0, 30) : null;
  const venue = (TALK_VENUES as readonly string[]).includes(String(o.venue)) ? (o.venue as TalkVenue) : TALK_DEFAULT.venue;
  const minutes = (TALK_MINUTES as readonly number[]).includes(Number(o.minutes)) ? (Number(o.minutes) as TalkMinutes) : TALK_DEFAULT.minutes;
  return { persona, venue, minutes };
}
/** 既定の8マスの役割（案によって入れ替わってよい） */
export const TALK_ROLES: readonly string[] = ['つかみ（相手の困りごと・意外な事実）', '今日の結論（1文）', 'なぜ今この話か', '前提のしくみ（やさしく）', '具体例・データ', 'よくある誤解', '明日からできること', 'まとめと次の一歩'];
/** 時間配分（決定的・R-74）: 中央0分・8マスに等配分（1分単位の切り捨て）・端数は最後のマスへ。合計＝選んだ時間 */
export function talkMinutes(total: number, cells = GRID9_CELLS): number[] {
  const base = Math.floor(total / cells);
  const out = Array.from({ length: cells }, () => base);
  out[cells - 1] += total - base * cells;
  return out;
}
export function talkMinutesLabel(m: number): string {
  return `約 ${m} 分`;
}
/** 話題の検証（AI の basis が元テキストに verbatim で実在するか。無ければ「元テキスト外」＝既定オフ・R-127） */
export function parseTalkTopics(v: unknown): TalkTopic[] {
  if (!Array.isArray(v)) return [];
  const out: TalkTopic[] = [];
  for (const x of v) {
    const o = (x ?? {}) as Record<string, unknown>;
    const topic = typeof o.topic === 'string' ? o.topic.replace(/\s+/g, ' ').trim().slice(0, 20) : '';
    const pos = Number(o.position);
    const basis = typeof o.basis === 'string' ? o.basis.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    if (!topic || !Number.isInteger(pos) || pos < 0 || pos > 8 || pos === 4) continue;
    out.push({ topic, position: pos, basis });
    if (out.length >= 5) break;
  }
  return out;
}
export function topicEvidence(sourceText: string, topic: TalkTopic): string | null {
  const b = topic.basis.trim();
  if (b.length >= 6 && normalizeForMatch(sourceText).includes(normalizeForMatch(b))) return b;
  return null;
}
export const TOPIC_OUTSIDE_LABEL = '元テキスト外';
/** マスの位置（0〜8）→ groups の添字（planToMandalaCells と同じ並び） */
export function talkGroupIndexOf(position: number): number {
  return MANDALA_OUTLINE_POSITIONS.indexOf(position);
}
export function talkPositionLabel(position: number): string {
  return ['左上', '上', '右上', '左', '中央', '右', '左下', '下', '右下'][position] ?? String(position);
}
/** 話題をそのマスの要素に追記（承認前＝編集できる。既にあれば増やさない・決定的） */
export function appendTopicToPlan(plan: VisualPlan, topic: TalkTopic): VisualPlan {
  const gi = talkGroupIndexOf(topic.position);
  if (gi < 0 || gi >= plan.groups.length) return plan;
  const g = plan.groups[gi];
  if (g.points.includes(topic.topic)) return plan;
  return { ...plan, groups: plan.groups.map((x, i) => (i === gi ? { ...x, points: [...x.points, topic.topic] } : x)) };
}
export function removeTopicFromPlan(plan: VisualPlan, topic: TalkTopic): VisualPlan {
  const gi = talkGroupIndexOf(topic.position);
  if (gi < 0 || gi >= plan.groups.length) return plan;
  return { ...plan, groups: plan.groups.map((x, i) => (i === gi ? { ...x, points: x.points.filter((p) => p !== topic.topic) } : x)) };
}

/** プレゼン構成のプラン→スライド構成案（317 /api/pack kind=slides）へ渡す本文（決定的） */
export function talkPlanToSourceText(plan: Pick<VisualPlan, 'title' | 'groups'>, talk: TalkTarget, personaLabel: string | null): string {
  const mins = talkMinutes(talk.minutes);
  const cells = plan.groups.filter((g) => (g.heading ?? '').trim()).slice(0, GRID9_CELLS);
  const lines: string[] = [];
  lines.push(`# ${plan.title.trim()}`);
  lines.push('', `- 誰に: ${personaLabel ?? '一般'}`, `- どこで: ${talk.venue}`, `- 時間: ${talk.minutes}分`);
  cells.forEach((g, i) => {
    lines.push('', `## ${i + 1}. ${(g.heading ?? '').trim()}（${talkMinutesLabel(mins[i])}）`);
    for (const p of g.points) lines.push(`- ${p}`);
  });
  return lines.join('\n');
}
