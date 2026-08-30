// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 276: 喩え話・比喩表現の生成（汎用・中学生に伝わる水準）
// 画面（/dashboard/metaphor）とAPI（/api/metaphor）が共有する **純関数だけ** を置く。
//
// 設計の要点:
//  §2  ガードは2層。普遍層は常に適用、医療層は分野が「医療・健康」のときだけ（R-69: ガードは後勝ち）
//  §2-3 分野の既定は「医療・健康」。自動判定はしない（誤判定の実害が非対称なので安全側に倒す）
//  §3  「中学生に伝わる」は**喩える先の材料を縛る**ことで検証可能にする（抽象で抽象を喩えない）
//  §5  比喩には必ず「当てはまる範囲／当てはまらない点」を併記する（R-75を比喩の形に落としたもの）
//  §6  3つの比喩は3軸（構造・動作・数量）を1つずつ埋める。軸はAIに選ばせない（R-74）
//  §8-2 1ターゲット層 = 1リクエスト（269・275と同じ）。R-73の積算は下の定数が正本
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { MEDICAL_AD_NG_RULES } from './medical-ad-check';
import { getPersonaStyle } from './persona-styles';

// ── §2-4 分野 ───────────────────────────────────────────────────
export type MetaphorField = 'medical' | 'general';

export const METAPHOR_FIELDS: readonly { key: MetaphorField; label: string; hint: string }[] = [
  { key: 'medical', label: '医療・健康', hint: '医療広告ガードを適用します（既定）' },
  { key: 'general', label: '一般', hint: '経済・IT・歴史など。医療ガードは外れます' },
] as const;

/**
 * §2-3: 既定は「医療・健康」。
 * 「既定が医療で一般の話に使い忘れる」＝出力が少し硬いだけ。
 * 「既定が一般で医療の話に使い忘れる」＝ガード無しで医療の比喩が出る。
 * 失敗の重さが非対称なので安全側に倒し、「一般」は能動的に選ぶ操作にする。
 */
export const DEFAULT_METAPHOR_FIELD: MetaphorField = 'medical';

export function isMetaphorField(v: unknown): v is MetaphorField {
  return v === 'medical' || v === 'general';
}

export function metaphorFieldOf(v: unknown): MetaphorField {
  return isMetaphorField(v) ? v : DEFAULT_METAPHOR_FIELD;
}

// ── §4 ターゲット層 ─────────────────────────────────────────────
export type MetaphorAudienceKey =
  | 'junior' | 'elementary' | 'student' | 'worker' | 'senior' | 'adjacent' | 'expert'
  | 'beauty' | 'family' | 'parenting';

export interface MetaphorAudience {
  key: MetaphorAudienceKey;
  emoji: string;
  label: string;
  hint: string;
  /** プロンプトへ差し込む読み手の指示 */
  tone: string;
  /** 分野が「医療・健康」のときだけ選べる層（§4-2） */
  medicalOnly: boolean;
  /**
   * §7-1: 患者・一般向けの層。戦争・闘争の比喩を避ける
   * （病状が悪化したとき「闘い方が悪かった」と受け取られる余地を作らないため）
   */
  gentle: boolean;
}

/** ①ペルソナ別note記事の医療特化ペルソナを流用する（§4-2。定義を二重に持たない） */
function fromPersona(key: 'beauty' | 'family' | 'parenting', gentle: boolean): MetaphorAudience {
  const p = getPersonaStyle(key);
  return {
    key,
    emoji: p.emoji,
    label: p.label,
    hint: p.hint,
    tone: p.promptBlock,
    medicalOnly: true,
    gentle,
  };
}

export const METAPHOR_AUDIENCES: readonly MetaphorAudience[] = [
  {
    key: 'junior', emoji: '🧒', label: '中学生でも分かる',
    hint: '短い文・身近なたとえ。専門用語は日常語に言い換える',
    tone: '読み手は中学生。1文を短く（目安40〜60字）、一文一義で書く。専門用語は日常のことばに言い換え、'
      + '必要なら「＝〜のこと」と直後に添える。漢語調の硬い表現は和語にする。',
    medicalOnly: false, gentle: true,
  },
  {
    key: 'elementary', emoji: '🎒', label: '小学生でも分かる',
    hint: 'さらに平易。漢語を避ける',
    tone: '読み手は小学校高学年。漢語をできるだけ使わず、ひらがな混じりのやさしい言い方にする。'
      + '1文は30字前後。むずかしい言葉が要るときは、そのつど短く説明する。',
    medicalOnly: false, gentle: true,
  },
  {
    key: 'student', emoji: '📖', label: '高校生・大学生',
    hint: '基礎知識は前提にしてよい',
    tone: '読み手は高校生・大学生。理科・社会の基礎知識は前提にしてよい。'
      + '仕組みの筋道が追えるように、順序立てて書く。',
    medicalOnly: false, gentle: false,
  },
  {
    key: 'worker', emoji: '💼', label: '社会人一般',
    hint: '仕事の場面に引きつける',
    tone: '読み手は働いている大人。仕事の場面（会議・段取り・引き継ぎ等）に引きつけて喩える。'
      + '結論を先に置き、短くまとめる。',
    medicalOnly: false, gentle: false,
  },
  {
    key: 'senior', emoji: '👴', label: '年配の方',
    hint: 'ゆっくり丁寧・カタカナ語を減らす',
    tone: '読み手は60代以上。カタカナ語・略語を減らし、丁寧な日本語で書く。'
      + '話題を短く区切って順に積み上げる。不安を煽らない。',
    medicalOnly: false, gentle: true,
  },
  {
    key: 'adjacent', emoji: '🤝', label: '専門外の同僚',
    hint: '隣接分野の人。用語は説明つきで使える',
    tone: '読み手は隣接する分野の同僚。専門用語は使ってよいが、初出で1行の説明を添える。'
      + '相手の分野の常識に置き換えられる喩えを選ぶ。',
    medicalOnly: false, gentle: false,
  },
  {
    key: 'expert', emoji: '🎓', label: '専門家向け',
    hint: '同業者。用語はそのまま',
    tone: '読み手は同業の専門家。用語はそのまま使い、基礎の説明は省く。'
      + '喩えは「理解の近道」ではなく「説明の切り口」として簡潔に置く。',
    medicalOnly: false, gentle: false,
  },
  // §4-2: 分野が「医療・健康」のときだけ追加される3層（①のペルソナを流用）
  fromPersona('beauty', false),
  fromPersona('family', true),
  fromPersona('parenting', true),
] as const;

/** 既定は「中学生でも分かる」（§4-1） */
export const DEFAULT_METAPHOR_AUDIENCE: MetaphorAudienceKey = 'junior';

export function metaphorAudienceOf(key: unknown): MetaphorAudience {
  const found = METAPHOR_AUDIENCES.find((a) => a.key === key);
  return found ?? METAPHOR_AUDIENCES.find((a) => a.key === DEFAULT_METAPHOR_AUDIENCE)!;
}

/** その分野で選べる層。一般では医療特化の3層を出さない（§4-2） */
export function audiencesForField(field: MetaphorField): MetaphorAudience[] {
  return METAPHOR_AUDIENCES.filter((a) => field === 'medical' || !a.medicalOnly);
}

// ── §4-3 選択（最大3つ）─────────────────────────────────────────
export const MAX_METAPHOR_TARGETS = 3;

/**
 * 選択のトグル。上限を超える追加は**受け付けない**（271の toggleCompareId と同じ方針。
 * 古い方を押し出すと、比較していた列が黙って消えて事故に見える）。
 */
export function toggleMetaphorTarget(
  keys: readonly MetaphorAudienceKey[],
  key: MetaphorAudienceKey,
  max = MAX_METAPHOR_TARGETS,
): MetaphorAudienceKey[] {
  if (keys.includes(key)) return keys.filter((k) => k !== key);
  if (keys.length >= max) return [...keys];
  return [...keys, key];
}

/** 分野を切り替えたとき、その分野で選べない層を落とす（一般に切り替えたら医療特化層は外れる） */
export function sanitizeTargets(
  keys: readonly MetaphorAudienceKey[],
  field: MetaphorField,
): MetaphorAudienceKey[] {
  const allowed = new Set(audiencesForField(field).map((a) => a.key));
  return keys.filter((k) => allowed.has(k)).slice(0, MAX_METAPHOR_TARGETS);
}

// ── §6-2 3軸（AIに選ばせない）───────────────────────────────────
export type MetaphorAxisKey = 'structure' | 'process' | 'scale';

export const METAPHOR_AXES: readonly { key: MetaphorAxisKey; label: string; hint: string; example: string }[] = [
  { key: 'structure', label: '構造・モノ', hint: '何に似ているか', example: '細胞の発電所' },
  { key: 'process', label: '動作・プロセス', hint: 'どう動くか', example: '古い設備を壊して建て直す' },
  { key: 'scale', label: '数量・スケール', hint: 'どれくらいか', example: '1つの細胞に数百個' },
] as const;

/** 軸が成立しない内容のとき、無理に埋めさせずこう書かせる（§6-2） */
export const AXIS_NOT_APPLICABLE = '該当なし';

export interface MetaphorItem {
  axis: MetaphorAxisKey;
  /** 比喩そのもの（該当なしのときは AXIS_NOT_APPLICABLE） */
  metaphor: string;
  /** §5-2 どこまで当てはまるか */
  appliesTo: string;
  /** §5-2 どこから違うか */
  doesNotApply: string;
}

export function isAxisNotApplicable(item: MetaphorItem): boolean {
  return item.metaphor.trim() === '' || item.metaphor.trim().startsWith(AXIS_NOT_APPLICABLE);
}

/**
 * AIの返答を**必ず3軸・固定順**に整える（R-74: 並びをAIの気分に任せない）。
 * 欠けている軸は「該当なし」で埋める＝空欄にして理由が消えるのを防ぐ（fail-closed）。
 */
export function alignAxes(raw: unknown): MetaphorItem[] {
  const list = Array.isArray(raw) ? raw : [];
  return METAPHOR_AXES.map((axis) => {
    const hit = list.find(
      (x) => x && typeof x === 'object' && (x as { axis?: unknown }).axis === axis.key,
    ) as Partial<MetaphorItem> | undefined;
    const metaphor = typeof hit?.metaphor === 'string' ? hit.metaphor.trim() : '';
    return {
      axis: axis.key,
      metaphor: metaphor || AXIS_NOT_APPLICABLE,
      appliesTo: typeof hit?.appliesTo === 'string' ? hit.appliesTo.trim() : '',
      doesNotApply: typeof hit?.doesNotApply === 'string' ? hit.doesNotApply.trim() : '',
    };
  });
}

// ── §3-4 機械検証（表示のみ。自動修正はしない＝R-26）──────────────
/**
 * 「抽象で抽象を喩える」典型語。完全性は求めず、正規表現で拾える範囲に留める（§3-4）。
 * ここに載せるのは「中学生に通じないカタカナ抽象語」だけにする——
 * 生活語（テレビ・ゲーム等）まで拾うと警告が鳴り続けて誰も見なくなる（R-44）。
 */
export const ABSTRACT_WORDS: readonly string[] = [
  'パラダイム', 'エコシステム', 'アーキテクチャ', 'フレームワーク', 'スキーム',
  'ソリューション', 'イノベーション', 'シナジー', 'コンセンサス', 'ステークホルダー',
  'リソース', 'プラットフォーム', 'レバレッジ', 'アジェンダ', 'ロードマップ',
  'メタファー', 'アナロジー', 'ダイナミクス', 'ポートフォリオ', 'インフラストラクチャー',
] as const;

/** 1文がこれを超えたら「長すぎる」と警告する（目安40〜60字に対する上限側の線） */
export const LONG_SENTENCE_MAX = 80;

export interface PlainCheck {
  abstractWords: string[];
  longSentences: string[];
}

export function checkPlainLanguage(text: string): PlainCheck {
  const src = (text ?? '').trim();
  if (!src) return { abstractWords: [], longSentences: [] };
  const abstractWords = ABSTRACT_WORDS.filter((w) => src.includes(w));
  const longSentences = (src.match(/[^。！？!?\n]+[。！？!?]?/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > LONG_SENTENCE_MAX);
  return { abstractWords, longSentences };
}

/** 1列（1ターゲット層）ぶんの検証。カード単位ではなく列単位でまとめて出す */
export function checkColumnPlainLanguage(items: readonly MetaphorItem[]): PlainCheck {
  const joined = items
    .map((i) => [i.metaphor, i.appliesTo, i.doesNotApply].join('\n'))
    .join('\n');
  return checkPlainLanguage(joined);
}

// ── §8-1 入力 ───────────────────────────────────────────────────
/** 入力の文字数上限。過大な入力でタイムアウトさせない（§8-1） */
export const METAPHOR_INPUT_MAX = 4000;

// ── §8-2 時間の積算（R-73）───────────────────────────────────────
/** 生成1回あたりの内部タイムアウト */
export const METAPHOR_TIMEOUT_MS = 45_000;
/** 再試行回数（合計試行 = 1 + これ） */
export const METAPHOR_RETRIES = 1;
/** 医療広告チェック（医療分野のみ・付加情報。落ちても本体は返す＝R-39） */
export const METAPHOR_AD_CHECK_TIMEOUT_MS = 15_000;
/** ルートの maxDuration（route.ts / vercel.json と同値。ズレは単体テストが判定する＝R-83） */
export const METAPHOR_MAX_DURATION_S = 120;

export function metaphorBudgetMs(): number {
  return METAPHOR_TIMEOUT_MS * (1 + METAPHOR_RETRIES) + METAPHOR_AD_CHECK_TIMEOUT_MS;
}

// ── プロンプト ───────────────────────────────────────────────────
/** §3-2/3-3: 喩える先の材料を縛る（「分かりやすく」では守られないため） */
export const PLAIN_SOURCE_RULES = `## 喩える先（何に喩えるか）の制約
- 使ってよい素材: 学校・部活・宿題／家・料理・掃除／電車・自転車・信号／ゲーム・スポーツ／買い物・お金のやりとり
- 使わない素材: その分野の専門的な概念／業界用語／海外の慣習や制度／古典・故事成語
- **抽象的なことばで抽象的なことを喩えない**（「一種のパラダイムシフト」「エコシステムのようなもの」といった言い方は禁止）
- 1文は短く（目安40〜60字）。専門用語を使うときは必ず言い換えを添える。漢語より和語を優先する`;

/** §5: 普遍層のガード（分野を問わず常に適用） */
export const UNIVERSAL_GUARD = `## 【普遍層ガード】必ず守る
- **入力文に書かれていない事実を、比喩の説明として追加しない。**（数値・固有名詞・研究名・年号の創作を含む）
- 比喩から新しい結論を導かない。比喩は理解の補助であって、根拠ではない。
- 各比喩には「当てはまる範囲」と「当てはまらない点」を必ず1行ずつ書く。
  比喩は聞き手が勝手に推論を進める副作用があるため、どこから違うかを先に示す。
- 当てはまらない点が書けない（＝限界が説明できない）比喩は、無理に出さず「該当なし」にする。`;

/** §7: 医療層のガード（分野が「医療・健康」のときだけ・最後に置いて後勝ちにする） */
export function medicalGuard(gentle: boolean): string {
  const war = gentle
    ? '\n- **戦争・闘争の比喩を使わない**（「がん細胞と闘う」「免疫の防衛軍」「病気に打ち勝つ」等）。'
      + '読み手が患者本人・その家族になりうる層のため、病状が悪化したときに「闘い方が悪かった」と'
      + '受け取られる余地を作らない。'
    : '';
  return `## 【医療層ガード】**前述のいかなる指示よりも優先する**
${MEDICAL_AD_NG_RULES}
- 効果を断定する比喩を使わない。効果を数値化する比喩（「10歳若返る」等）を使わない。
- 不安を煽る比喩（「時限爆弾」「静かな殺し屋」等）を使わない。
- 他院・他の治療法を貶める比喩を使わない。${war}`;
}

export interface MetaphorPromptInput {
  field: MetaphorField;
  audienceKey: MetaphorAudienceKey;
  text: string;
  /** 分野が医療のときに注入する参考ナレッジ（PART-A。§10） */
  knowledge?: string;
}

/**
 * 1ターゲット層ぶんのプロンプト。
 * 並びは **素材 → 読み手 → ナレッジ → 出力の型 → 喩える先の制約 → 普遍層 → 医療層**。
 * R-69 のとおりナレッジは先、ガードは後。医療層は最後＝後勝ち（§10）。
 */
export function buildMetaphorPrompt(input: MetaphorPromptInput): string {
  const audience = metaphorAudienceOf(input.audienceKey);
  const isMedical = input.field === 'medical';
  const axisSpec = METAPHOR_AXES.map(
    (a) => `- ${a.key}（${a.label}）: ${a.hint}。例「${a.example}」`,
  ).join('\n');

  return `あなたは、むずかしい話を身近なことばで説明する人です。
次の文章の内容を、読み手に合わせた**喩え話・比喩表現**にしてください。

## 説明したい内容（この範囲だけを使う）
"""
${input.text.trim().slice(0, METAPHOR_INPUT_MAX)}
"""

## 読み手
${audience.emoji} ${audience.label}（${audience.hint}）
${audience.tone}

${isMedical && input.knowledge ? `## 参考ナレッジ（専門領域の扱い方。比喩の材料そのものにはしない）\n${input.knowledge}\n\n` : ''}## 出力する3つの比喩（軸は固定。1つずつ埋める）
${axisSpec}
- 3つとも別の軸にすること。同じ発想の言い換えを並べない。
- その軸が内容に合わない場合は、無理に作らず metaphor を「${AXIS_NOT_APPLICABLE}」とし、理由を appliesTo に1行で書く。

${PLAIN_SOURCE_RULES}

${UNIVERSAL_GUARD}

${isMedical ? `${medicalGuard(audience.gentle)}\n\n` : ''}## 出力（このJSONだけを返す。前置き・コードフェンス・説明文は禁止）
{
  "items": [
    { "axis": "structure", "metaphor": "比喩の本体（1〜2文）", "appliesTo": "当てはまる範囲（1文）", "doesNotApply": "当てはまらない点（1文）" },
    { "axis": "process", "metaphor": "...", "appliesTo": "...", "doesNotApply": "..." },
    { "axis": "scale", "metaphor": "...", "appliesTo": "...", "doesNotApply": "..." }
  ]
}`;
}

// ── 出力の組み立て（表示・コピー・保存で共用。決定的＝R-74）─────────
export function itemToMarkdown(item: MetaphorItem): string {
  const axis = METAPHOR_AXES.find((a) => a.key === item.axis);
  const head = `**${axis?.label ?? item.axis}**`;
  if (isAxisNotApplicable(item)) {
    return `${head}\n【比喩】${AXIS_NOT_APPLICABLE}${item.appliesTo ? `（${item.appliesTo}）` : ''}`;
  }
  return [
    head,
    `【比喩】${item.metaphor}`,
    `【当てはまる範囲】${item.appliesTo || '（未記入）'}`,
    `【当てはまらない点】${item.doesNotApply || '（未記入）'}`,
  ].join('\n');
}

export function columnToMarkdown(
  audienceKey: MetaphorAudienceKey,
  items: readonly MetaphorItem[],
): string {
  const audience = metaphorAudienceOf(audienceKey);
  return `## ${audience.emoji} ${audience.label}\n\n${items.map(itemToMarkdown).join('\n\n')}`;
}

export function metaphorDocumentToMarkdown(input: {
  field: MetaphorField;
  columns: { audienceKey: MetaphorAudienceKey; items: MetaphorItem[] | null }[];
}): string {
  const fieldLabel = METAPHOR_FIELDS.find((f) => f.key === input.field)?.label ?? '';
  const done = input.columns.filter((c) => c.items && c.items.length > 0);
  const header = [
    '# 喩え話・比喩表現',
    '',
    `- 分野: ${fieldLabel}`,
    `- ターゲット層: ${done.map((c) => metaphorAudienceOf(c.audienceKey).label).join('・') || '（なし）'}`,
    '- ※ 比喩は理解の補助です。「当てはまらない点」まで一緒に伝えてください。',
  ].join('\n');
  const body = done
    .map((c) => columnToMarkdown(c.audienceKey, c.items!))
    .join('\n\n');
  return `${header}\n\n${body}\n`;
}

/** 保存一覧（text_analysis_saves）へ入れるときのタイトル */
export function metaphorSaveTitle(sourceText: string): string {
  const head = (sourceText ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
  return `喩え話・比喩: ${head || '無題'}`;
}
