// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 317 §1-4/§3-2: まとめ（要約＋詳細）からのプレゼン素材パック（選択式）の純ロジック（DB 非依存・決定的・R-74／R-108）
//
// 画像系（表・フロー・比較・手順・概念図・関連図・タイムライン・数値・1枚サマリー・イメージ）は 315 の流れ
// （/dashboard/visuals?scope=library&ids=…&types=…）へ渡す＝プラン→編集→描画。ここでは種類と目安だけを持つ。
// テキスト系（スライド構成案・想定Q&A・用語集・引用集・プレゼン原稿）はここでプロンプト／決定的抽出／検証を持ち、
// /api/pack が保存する（library に別行・metadata.pack・パック用の新テーブルは作らない）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { GEMINI_TEXT_MODEL } from '@/lib/ai-models';
import { MEDICAL_AD_NG_RULES } from '@/lib/medical-ad-check';
import { COMPARE_PROMPT_OVERHEAD_CHARS, costOf, estimateImageCost } from '@/lib/model-pricing';
import { VISUAL_TYPE_META, normalizeForMatch, type VisualType } from '@/lib/visuals';

export type PackTextKind = 'slides' | 'script' | 'glossary' | 'qa' | 'citations';
export type PackKind = VisualType | PackTextKind;
export const PACK_IMAGE_KINDS: readonly VisualType[] = ['table', 'flow', 'compare', 'steps', 'concept', 'relation', 'timeline', 'figures', 'onepage', 'image'];
export const PACK_TEXT_KINDS: readonly PackTextKind[] = ['slides', 'script', 'glossary', 'qa', 'citations'];
export const PACK_KINDS: readonly PackKind[] = [...PACK_IMAGE_KINDS, ...PACK_TEXT_KINDS];
export function isPackTextKind(v: unknown): v is PackTextKind {
  return typeof v === 'string' && (PACK_TEXT_KINDS as readonly string[]).includes(v);
}
export function isPackKind(v: unknown): v is PackKind {
  return typeof v === 'string' && (PACK_KINDS as readonly string[]).includes(v);
}
/** 既定のチェック（§1-4）: 関連図・1枚サマリー・スライド構成案 */
export const PACK_DEFAULT_KINDS: readonly PackKind[] = ['relation', 'onepage', 'slides'];
/** 公開される種類＝医療広告ガードを後勝ちで当てる（R-69） */
export const PACK_PUBLIC_KINDS: readonly PackTextKind[] = ['slides', 'qa', 'glossary'];

export interface PackCatalogEntry {
  kind: PackKind;
  group: 'image' | 'text';
  label: string;
  purpose: string;
  how: string;
  /** 所要時間の目安（秒）。画像系は「プラン抽出→描画」まで */
  estSeconds: number;
}
export const PACK_CATALOG: readonly PackCatalogEntry[] = [
  ...(['table', 'flow', 'compare', 'steps', 'concept'] as const).map((k) => ({ kind: k as PackKind, group: 'image' as const, label: VISUAL_TYPE_META[k].label, purpose: 'スライドの図', how: 'コード描画（315）', estSeconds: 25 })),
  { kind: 'relation', group: 'image', label: '関連図', purpose: '全体像の1枚', how: 'コード描画（円周配置）', estSeconds: 25 },
  { kind: 'timeline', group: 'image', label: 'タイムライン', purpose: '経緯・工程', how: 'コード描画（等間隔）', estSeconds: 25 },
  { kind: 'figures', group: 'image', label: '数値ハイライト', purpose: '冒頭の掴み', how: 'コード描画（数字は引用と完全一致）', estSeconds: 25 },
  { kind: 'onepage', group: 'image', label: '1枚サマリー', purpose: '配布用・note冒頭', how: 'コード描画（図を埋め込み可）', estSeconds: 25 },
  { kind: 'image', group: 'image', label: 'イメージ画像', purpose: '表紙・章扉', how: 'GPT Image 2.5（絵柄）＋文字はコード', estSeconds: 60 },
  { kind: 'slides', group: 'text', label: 'スライド構成案', purpose: 'スライド作成の下書き（PPTX化は別便）', how: 'Gemini（Markdown）', estSeconds: 30 },
  { kind: 'script', group: 'text', label: 'プレゼン原稿', purpose: '発表', how: '🎤プレゼン原稿（275）へまとめを渡す', estSeconds: 90 },
  { kind: 'glossary', group: 'text', label: '用語集', purpose: '配布資料の末尾', how: 'Gemini→表（定義は引用で実在検証）', estSeconds: 30 },
  { kind: 'qa', group: 'text', label: '想定Q&A', purpose: '質疑の準備', how: 'Gemini（Markdown）', estSeconds: 30 },
  { kind: 'citations', group: 'text', label: '引用集', purpose: '根拠の提示', how: '決定的抽出（AIなし）', estSeconds: 2 },
];
export function packEntry(kind: PackKind): PackCatalogEntry {
  return PACK_CATALOG.find((e) => e.kind === kind)!;
}
/** 費用の目安（USD）。画像系はプラン抽出（Gemini）＋（イメージだけ GPT Image 2.5 medium 横）。テキスト系は Gemini。引用集は 0 */
export function packEstimateUsd(kind: PackKind, sourceChars: number): number | null {
  if (kind === 'citations' || kind === 'script') return 0;
  const gemini = costOf(GEMINI_TEXT_MODEL, sourceChars + COMPARE_PROMPT_OVERHEAD_CHARS, kind === 'slides' ? 4000 : 2500) ?? 0;
  if (kind === 'image') return gemini + estimateImageCost('medium', 'landscape', 400).usd;
  return gemini;
}
export const PACK_MAX_SELECT = PACK_KINDS.length;

// ───────────────────────────────────────────────────────────────────────────
// プロンプト（テキスト系・Gemini）。公開される種類は医療広告ガードを末尾（後勝ち・R-69）
// ───────────────────────────────────────────────────────────────────────────

const GUARD_SECTION = `\n\n# 医療広告ガイドライン（必ず守る・この節が最優先）\n以下に該当する表現は使わない。まとめに無い効果・実績・数字・体験を足さない。\n${MEDICAL_AD_NG_RULES}`;
const COMMON = '記事にある内容だけを使う（まとめに無い事実・数字・評価を補わない）。見出しは「## 」と「### 」の2階層（「# 」は使わない）。強調は **太字**、列挙は「- 」。';

export function buildSlidesPrompt(source: string): { system: string; prompt: string } {
  return {
    system: 'あなたは医療クリニックのプレゼン資料を設計する編集者です。出力は Markdown のみ。',
    prompt: `以下のまとめから、プレゼンの**スライド構成案**を作ってください。\n\n# 形式\n- 8〜12枚。1枚1メッセージ\n- 各枚: 「## n. スライドタイトル（1行メッセージ）」→ 要点3つ（「- 」）→ 「### 話者ノート」（2〜4文）\n- 最初の枚は表紙（タイトル・副題）、最後は「まとめ・次の一歩」\n- ${COMMON}\n\n# まとめ\n${source}${GUARD_SECTION}`,
  };
}
export function buildQaPrompt(source: string): { system: string; prompt: string } {
  return {
    system: 'あなたは医療クリニックの発表を支える編集者です。出力は Markdown のみ。',
    prompt: `以下のまとめから、発表で聞かれそうな**想定Q&A**を5〜8組作ってください。\n\n# 形式\n- 各組: 「## Q. 質問」→ 「A. 回答（2〜5文）」\n- 回答はまとめにある内容の範囲で。まとめに無いことは「まとめには記載がありません」と書く\n- ${COMMON}\n\n# まとめ\n${source}${GUARD_SECTION}`,
  };
}
export function buildGlossaryPrompt(source: string): { system: string; prompt: string } {
  return {
    system: 'あなたは医療クリニックの配布資料を作る編集者です。出力は JSON のみ。',
    prompt: `以下のまとめから、配布資料の末尾に載せる**用語集**を作ってください。\n\n# 絶対に守ること\n- term はまとめに実際に出てくる語（そのまま）。6〜12件\n- evidence はその語を説明している**まとめからの引用そのまま**（原文の連続した一節・80字以内・言い換え禁止）。引用が無い語は出さない\n- definition は evidence の内容だけで書く（補わない・40字以内）\n\n# まとめ\n${source}\n\n# 出力フォーマット（必ずこの JSON のみ）\n{ "terms": [ { "term": "…", "definition": "…", "evidence": "…" } ] }${GUARD_SECTION}`,
  };
}

export interface GlossaryTerm {
  term: string;
  definition: string;
  evidence: string;
}
/** 用語集の検証（決定的）: term と evidence がまとめに実在（空白・記号の正規化のみ）。実在しないものは捨てて件数 */
export function validateGlossary(json: unknown, source: string): { terms: GlossaryTerm[]; dropped: number } {
  const src = normalizeForMatch(source);
  const raw = Array.isArray((json as { terms?: unknown })?.terms) ? ((json as { terms: unknown[] }).terms) : [];
  const terms: GlossaryTerm[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const term = typeof o.term === 'string' ? o.term.trim().slice(0, 40) : '';
    const definition = typeof o.definition === 'string' ? o.definition.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const evidence = typeof o.evidence === 'string' ? o.evidence.replace(/\s+/g, ' ').trim() : '';
    const ok = term && definition && evidence && evidence.length <= 120 && src.includes(normalizeForMatch(term)) && src.includes(normalizeForMatch(evidence)) && !seen.has(term);
    if (!ok) {
      dropped += 1;
      continue;
    }
    seen.add(term);
    terms.push({ term, definition, evidence });
    if (terms.length >= 12) break;
  }
  return { terms, dropped };
}
export function glossaryMarkdown(terms: readonly GlossaryTerm[]): string {
  const rows = terms.map((t) => `| ${t.term.replace(/\|/g, '｜')} | ${t.definition.replace(/\|/g, '｜')} | ${t.evidence.replace(/\|/g, '｜')} |`);
  return `## 用語集\n\n| 用語 | 定義 | 出典（まとめからの引用） |\n|---|---|---|\n${rows.join('\n')}`;
}

// ───────────────────────────────────────────────────────────────────────────
// 引用集（決定的抽出・AIなし）: 数字か「」を含む文を元資料から抜き、出典（資料名）を添える
// ───────────────────────────────────────────────────────────────────────────

export interface Citation {
  quote: string;
  source: string;
}
export const CITATION_MAX = 16;
export const CITATION_QUOTE_MAX = 120;
export function extractCitations(sources: readonly { title: string; text: string }[]): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const sentences = (s.text ?? '')
      .replace(/\r\n?/g, '\n')
      .split(/(?<=[。！？!?])\s*|\n+/)
      .map((x) => x.replace(/^[#>\-*\s]+/, '').trim())
      .filter(Boolean);
    for (const sent of sentences) {
      if (out.length >= CITATION_MAX) break;
      if (sent.length > CITATION_QUOTE_MAX || sent.length < 8) continue;
      if (!/\d/.test(sent) && !/「.+?」/.test(sent)) continue;
      const key = normalizeForMatch(sent);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ quote: sent, source: s.title || '（無題）' });
    }
  }
  return out;
}
export function citationsMarkdown(items: readonly Citation[]): string {
  if (items.length === 0) return '## 引用集\n\n（数字や引用を含む文が見つかりませんでした）';
  return `## 引用集\n\n${items.map((c) => `- 「${c.quote}」（出典: ${c.source}）`).join('\n')}`;
}

// ───────────────────────────────────────────────────────────────────────────
// 保存（library・別行・metadata.pack）
// ───────────────────────────────────────────────────────────────────────────

export const PACK_TYPE = 'pack';
export function packTitle(kind: PackKind, baseTitle: string): string {
  return `${packEntry(kind).label}: ${baseTitle.replace(/^統合サマリー:\s*/, '').slice(0, 60)}`;
}
export function packTags(kind: PackKind): string {
  return `統合レポート,プレゼン素材,${packEntry(kind).label}`;
}
export function packMetadata(of: readonly string[], kind: PackKind, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { pack: { of: [...of], kind, ...extra } };
}
/** 行の metadata から「この行が素材の元になったまとめか」を見て件数を数える（📚の「🎁 n」・画面側で導出） */
export function packCountsOf(items: readonly { id: string | number; metadata?: unknown }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    let meta: Record<string, unknown> | null = null;
    try {
      meta = typeof it.metadata === 'string' ? (JSON.parse(it.metadata) as Record<string, unknown>) : ((it.metadata ?? null) as Record<string, unknown> | null);
    } catch {
      meta = null;
    }
    const pack = meta?.pack as { of?: unknown } | undefined;
    if (!pack || !Array.isArray(pack.of)) continue;
    for (const id of pack.of) out[String(id)] = (out[String(id)] ?? 0) + 1;
  }
  return out;
}
/** 🎤プレゼン原稿への handoff（localStorage の一回限りキー。noopener の新タブに sessionStorage は渡らない）。まとめを「## 見出し」ごとにページ分割（最大12） */
export const PRESENTATION_HANDOFF_KEY = 'presentation-handoff';
export function splitIntoSlidePages(markdown: string, max = 12): { title: string; text: string }[] {
  const parts = markdown.replace(/\r\n?/g, '\n').split(/\n(?=## )/).map((p) => p.trim()).filter(Boolean);
  const pages = parts.map((p) => {
    const m = p.match(/^##\s*(.+)$/m);
    return { title: (m?.[1] ?? '').trim().slice(0, 60) || '（見出しなし）', text: p.slice(0, 4000) };
  });
  return pages.slice(0, max);
}
