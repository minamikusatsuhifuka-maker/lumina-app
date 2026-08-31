// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 279: 分かりにくい箇所の指摘と、あるあるネタでの言い換え（純関数）
//
// 二段構え（§2-2）:
//   機械検出 = このファイルの diagnose()。**決定的**（同じ文章なら必ず同じ結果・R-74）。閾値・辞書は
//              PLAIN_CHECK_THRESHOLDS / TERM_DICTIONARY に1箇所でまとめる（後から動かせる）
//   AI判定   = 「参考」。文脈・論理の飛躍・前提の省略。機械検出と混ぜて表示しない
// 言い換えは1箇所=1リクエストの**提案**で、本文は自動で書き換えない（§3・R-26）。
// 276（喩え話）の資産を流用: 抽象語辞書・喩える先の制約・普遍層/医療層ガード・汎用7層。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  ABSTRACT_WORDS,
  LONG_SENTENCE_MAX,
  METAPHOR_AUDIENCES,
  PLAIN_SOURCE_RULES,
  UNIVERSAL_GUARD,
  medicalGuard,
  type MetaphorAudience,
  type MetaphorField,
} from './metaphor';
import { getPersonaStyle } from './persona-styles';

// ── §2-3 閾値・辞書（1箇所にまとめる。画面からは変えない）────────────────
export const PLAIN_CHECK_THRESHOLDS = {
  /** 一文の長さ（276と同じ80字） */
  longSentence: LONG_SENTENCE_MAX,
  /** 連続するカタカナ語: カタカナ語がこの個数以上つながる（「・」や助詞なしで並ぶ） */
  katakanaRun: 2,
  /** 一文中のカタカナ比率がこれ以上（文が20字以上のとき） */
  katakanaRatio: 0.4,
  katakanaRatioMinLen: 20,
  /** 漢字がこの文字数以上連続する（「細胞内酸化ストレス応答機構」等） */
  kanjiRun: 7,
  /** 括弧内の補足がこの文字数を超える */
  parenLen: 20,
} as const;

/** 276の20語に加える抽象語（横文字で概念を説明してしまう語） */
export const EXTRA_ABSTRACT_WORDS: readonly string[] = [
  'コンセプト', 'プロセス', 'メカニズム', 'ファクター', 'アプローチ', 'パースペクティブ',
  'ガバナンス', 'コンプライアンス', 'ベネフィット', 'リテラシー', 'マインドセット',
] as const;
export const ALL_ABSTRACT_WORDS: readonly string[] = [...ABSTRACT_WORDS, ...EXTRA_ABSTRACT_WORDS];

/**
 * 専門用語の辞書（§2-3）。**ここに足せば検出に載る**。分野をまたいで使う語のみ（固有名詞は入れない）。
 * 各語に「一言の言い換え」を添える（画面の指摘に出す。言い換え生成の材料にもなる）。
 */
export const TERM_DICTIONARY: readonly { term: string; plain: string }[] = [
  { term: '角層', plain: '肌のいちばん外側の層' },
  { term: 'バリア機能', plain: '肌を守る働き' },
  { term: '経皮吸収', plain: '皮ふから吸い込まれること' },
  { term: 'エビデンス', plain: '根拠となる研究' },
  { term: '有意差', plain: '偶然とは言えない差' },
  { term: 'オッズ比', plain: '起こりやすさの比べ方' },
  { term: '寛解', plain: '症状が落ち着いた状態' },
  { term: '増悪', plain: '悪くなること' },
  { term: '外用', plain: '塗り薬' },
  { term: '内服', plain: '飲み薬' },
  { term: '既往歴', plain: 'これまでにかかった病気' },
  { term: '予後', plain: 'この先の見通し' },
  { term: '侵襲', plain: '体への負担' },
  { term: '禁忌', plain: 'してはいけないこと' },
  { term: 'アドヒアランス', plain: '治療を続けられている度合い' },
  { term: 'QOL', plain: '生活の質' },
  { term: '炎症', plain: '赤く腫れて熱を持つ反応' },
  { term: '抗酸化', plain: 'さびつきを防ぐ働き' },
  { term: 'ATP', plain: '体のエネルギーのもと' },
  { term: 'インフレ', plain: '物の値段が上がり続けること' },
  { term: 'キャッシュフロー', plain: 'お金の出入り' },
  { term: 'ROI', plain: 'かけたお金に対する見返り' },
  { term: 'アルゴリズム', plain: '手順の決まり' },
  { term: 'API', plain: 'プログラム同士のつなぎ口' },
  { term: 'スループット', plain: '時間あたりにこなせる量' },
] as const;

// ── 指摘 ─────────────────────────────────────────────────────────
export type IssueKind = 'long' | 'abstract' | 'katakana' | 'kanji' | 'paren' | 'term';

export const ISSUE_KIND_DEFS: Record<IssueKind, { label: string; hint: string }> = {
  long: { label: '一文が長い', hint: `${PLAIN_CHECK_THRESHOLDS.longSentence}字を超える文（目安は40〜60字）` },
  abstract: { label: '抽象語', hint: '横文字の概念で概念を説明している' },
  katakana: { label: 'カタカナ語の連続', hint: 'カタカナ語が続く・文の大半がカタカナ' },
  kanji: { label: '漢語の連続', hint: `漢字が${PLAIN_CHECK_THRESHOLDS.kanjiRun}字以上つながる` },
  paren: { label: '括弧内の補足が長い', hint: `括弧の中が${PLAIN_CHECK_THRESHOLDS.parenLen}字を超える（読みの流れを切る）` },
  term: { label: '専門用語', hint: '辞書にある語。言い換えを添えたい' },
};

export interface PlainIssue {
  /** 決定的なID（種別＋文番号＋出現順）。同じ文章なら必ず同じ */
  id: string;
  kind: IssueKind;
  /** 何文目か（0始まり） */
  sentenceIndex: number;
  /** 指摘対象の文（そのまま言い換えの単位になる） */
  sentence: string;
  /** 文の中で問題の箇所（強調表示用） */
  excerpt: string;
  /** 指摘の補足（辞書の言い換え等） */
  detail: string;
}

/** 文の分割（決定的）。句点・！・？・改行で切る */
export function splitSentences(text: string): string[] {
  return (text ?? '')
    .split(/(?<=[。！？!?])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const KATAKANA_WORD = /[\p{Script=Katakana}ー]{2,}/gu;
const KANJI_RUN = /\p{Script=Han}+/gu;
const PAREN = /[（(]([^（）()]*)[）)]/g;

/**
 * 機械検出（§2-3）。AIを呼ばず即座に決まる。順序は〈文の順 → 種別の順〉で固定。
 */
export function diagnose(text: string): PlainIssue[] {
  const th = PLAIN_CHECK_THRESHOLDS;
  const out: PlainIssue[] = [];
  const sentences = splitSentences(text);
  sentences.forEach((sentence, si) => {
    const push = (kind: IssueKind, excerpt: string, detail: string) => {
      const seq = out.filter((i) => i.sentenceIndex === si && i.kind === kind).length;
      out.push({ id: `${kind}-${si}-${seq}`, kind, sentenceIndex: si, sentence, excerpt, detail });
    };

    // 一文の長さ
    if (sentence.length > th.longSentence) {
      push('long', sentence, `${sentence.length}字（目安40〜60字）`);
    }
    // 抽象語（276の辞書＋拡張）
    for (const w of ALL_ABSTRACT_WORDS) {
      if (sentence.includes(w)) push('abstract', w, '抽象的な横文字。具体的な言い方に');
    }
    // 専門用語（辞書。長い語を先に見て、部分一致の二重検出を避ける）
    const terms = [...TERM_DICTIONARY].sort((a, b) => b.term.length - a.term.length);
    const hit = new Set<string>();
    for (const t of terms) {
      if (!sentence.includes(t.term)) continue;
      if ([...hit].some((h) => h.includes(t.term))) continue;
      hit.add(t.term);
      push('term', t.term, `＝${t.plain}`);
    }
    // カタカナ語の連続 or 比率
    const words = sentence.match(KATAKANA_WORD) ?? [];
    const runs = sentence.match(/(?:[\p{Script=Katakana}ー]{2,}[・\s]?){2,}/gu) ?? [];
    for (const r of runs) {
      const count = (r.match(KATAKANA_WORD) ?? []).length;
      if (count >= th.katakanaRun) push('katakana', r.trim(), `カタカナ語が${count}語つながっています`);
    }
    if (sentence.length >= th.katakanaRatioMinLen) {
      const kata = words.join('').length;
      const ratio = kata / sentence.length;
      if (ratio >= th.katakanaRatio && runs.length === 0) {
        push('katakana', words.join('・'), `文の${Math.round(ratio * 100)}%がカタカナです`);
      }
    }
    // 漢語の連続
    for (const k of sentence.match(KANJI_RUN) ?? []) {
      if (k.length >= th.kanjiRun) push('kanji', k, `漢字が${k.length}字続いています。区切るか和語に`);
    }
    // 括弧内の補足
    for (const m of sentence.matchAll(PAREN)) {
      if (m[1].length > th.parenLen) push('paren', m[0], `括弧の中が${m[1].length}字。文を分けるか本文へ`);
    }
  });
  return out;
}

/** 同じ文章から得た結果が一致するか（E2E・単体の判定に使う） */
export function issuesSignature(issues: readonly PlainIssue[]): string {
  return issues.map((i) => `${i.id}:${i.excerpt}`).join('|');
}

// ── §4-1 対象読者（276の汎用7層＋主婦向け）────────────────────────────
export type PlainAudienceKey = MetaphorAudience['key'] | 'homemaker';

export interface PlainAudience {
  key: PlainAudienceKey;
  emoji: string;
  label: string;
  hint: string;
  tone: string;
  /** 患者本人・家族になりうる層＝戦争メタファーを避ける（§5 医療層） */
  gentle: boolean;
}

const homemakerPersona = getPersonaStyle('homemaker');
/** 276の医療特化層とは別に、汎用層として「主婦向け」を追加（§4-1。要望に明記があるため） */
export const HOMEMAKER_AUDIENCE: PlainAudience = {
  key: 'homemaker',
  emoji: homemakerPersona.emoji,
  label: '主婦向け',
  hint: '家事・家計の目線。台所・洗濯・買い物のあるあるで',
  tone: homemakerPersona.promptBlock,
  gentle: true,
};

export const PLAIN_AUDIENCES: readonly PlainAudience[] = [
  ...METAPHOR_AUDIENCES.filter((a) => !a.medicalOnly).map((a) => ({
    key: a.key as PlainAudienceKey, emoji: a.emoji, label: a.label, hint: a.hint, tone: a.tone, gentle: a.gentle,
  })),
  HOMEMAKER_AUDIENCE,
];

/** 既定は「中学生でも分かる」（§4-1） */
export const DEFAULT_PLAIN_AUDIENCE: PlainAudienceKey = 'junior';

export function plainAudienceOf(key: unknown): PlainAudience {
  return PLAIN_AUDIENCES.find((a) => a.key === key) ?? PLAIN_AUDIENCES.find((a) => a.key === DEFAULT_PLAIN_AUDIENCE)!;
}

// ── 入力上限・時間の積算（R-73）──────────────────────────────────────
export const PLAIN_INPUT_MAX = 4000; // 276と同程度
export const REPHRASE_TIMEOUT_MS = 45_000;
export const REPHRASE_RETRIES = 1;
export const REPHRASE_AD_CHECK_TIMEOUT_MS = 15_000;
/** /api/plain-check/rephrase・/review の maxDuration（route.ts / vercel.json と同値。U53が判定＝R-83） */
export const PLAIN_MAX_DURATION_S = 120;

export function rephraseBudgetMs(): number {
  return REPHRASE_TIMEOUT_MS * (1 + REPHRASE_RETRIES) + REPHRASE_AD_CHECK_TIMEOUT_MS;
}

// ── プロンプト（並びは 素材 → 読み手 → 制約 → 普遍層 → 医療層＝後勝ち・R-69）────
export interface RephrasePromptInput {
  field: MetaphorField;
  audienceKey: PlainAudienceKey;
  issue: Pick<PlainIssue, 'kind' | 'sentence' | 'excerpt' | 'detail'>;
  /** 前後の文（文脈。書き換え対象ではない） */
  before: string;
  after: string;
}

/** §4-2: 事実の同一性。言い換え後も元の文が伝えていた内容と同一であること（R-75） */
export const SAME_MEANING_RULES = `## 事実の同一性（最優先。ここを破ると使えません）
- 言い換え後も、**元の文が伝えていた内容と同一**であること。内容を足さない・削らない・強めない・弱めない。
- 元の文に書かれていない事実・数値・固有名詞・理由を、あるあるネタの説明として追加しない。
- 比喩から新しい結論を導かない（「だから〜すべき」を足さない）。
- 同じ意味を保ったまま分かりやすくできないときは、無理に作らず candidates を空にして reason に理由を書く。`;

export function buildRephrasePrompt(input: RephrasePromptInput): string {
  const audience = plainAudienceOf(input.audienceKey);
  const kind = ISSUE_KIND_DEFS[input.issue.kind];
  const isMedical = input.field === 'medical';
  return `あなたは、むずかしい文を読み手に合わせて言い換える編集者です。
次の「対象の文」だけを、日常のあるあるネタ（身近な場面）に沿って分かりやすく言い換えてください。

## 対象の文（この1文だけを言い換える）
"""
${input.issue.sentence}
"""
- 指摘の種類: ${kind.label}（${kind.hint}）
- 問題の箇所: 「${input.issue.excerpt}」${input.issue.detail ? `（${input.issue.detail}）` : ''}

## 前後の文（文脈。ここは書き換えない）
- 前: ${input.before.trim() || '（なし）'}
- 後: ${input.after.trim() || '（なし）'}

## 読み手
${audience.emoji} ${audience.label}（${audience.hint}）
${audience.tone}

## 言い換えの作り方
- 候補を2つ作る。1つは**あるあるネタ（身近な場面のたとえ）を使った言い換え**、もう1つは**たとえを使わない平易な言い換え**。
- 対象の文の長さの1.5倍以内に収める。1文は40〜60字。
- 専門用語を残す場合は「＝〜のこと」を直後に添える。

${PLAIN_SOURCE_RULES}

${SAME_MEANING_RULES}

${UNIVERSAL_GUARD}

${isMedical ? `${medicalGuard(audience.gentle)}\n\n` : ''}## 出力（このJSONだけを返す。前置き・コードフェンス・説明文は禁止）
{
  "candidates": [
    { "text": "あるあるネタを使った言い換え", "note": "使った場面を一言（例: 洗濯物の取り込み）" },
    { "text": "たとえを使わない平易な言い換え", "note": "" }
  ],
  "reason": "候補を出せないときだけ理由"
}`;
}

/** §2-4 AI判定（参考）: 機械では拾えない分かりにくさ。指摘のみ・言い換えはしない */
export type AiIssueKind = 'context' | 'logic' | 'premise';
export const AI_ISSUE_KIND_DEFS: Record<AiIssueKind, string> = {
  context: '文脈上の分かりにくさ',
  logic: '論理の飛躍',
  premise: '前提の省略',
};

export function buildReviewPrompt(text: string, audienceKey: PlainAudienceKey): string {
  const audience = plainAudienceOf(audienceKey);
  return `あなたは文章の読みやすさを点検する編集者です。次の文章を「${audience.label}」（${audience.hint}）が読む前提で、
**機械では拾えない**分かりにくさだけを指摘してください（一文の長さ・専門用語・カタカナ語は別に機械で検出済みなので挙げない）。

## 文章
"""
${text.trim().slice(0, PLAIN_INPUT_MAX)}
"""

## 挙げるもの（最大5件・確信があるものだけ。無ければ空配列）
- context: 文脈上の分かりにくさ（指示語が何を指すか不明、話題が急に変わる 等）
- logic: 論理の飛躍（AからBがなぜ導かれるか書かれていない）
- premise: 前提の省略（読み手が知らない前提を説明なしに使っている）
- 各件は、文章の中の**該当する文をそのまま**引用する（要約・言い換えをしない）。言い換え案は書かない。

## 出力（このJSONだけ）
{ "items": [ { "kind": "context", "excerpt": "該当する文をそのまま", "note": "何が分かりにくいか1文" } ] }`;
}

// ── 出力（コピー・保存。貼り付け先を限定しないので共通の copyRichMarkdown で足りる）──
export interface RephraseCandidate {
  text: string;
  note: string;
}

export function reportToMarkdown(input: {
  sourceText: string;
  field: MetaphorField;
  audienceKey: PlainAudienceKey;
  issues: readonly PlainIssue[];
  aiIssues: readonly { kind: AiIssueKind; excerpt: string; note: string }[];
  rephrases: Readonly<Record<string, RephraseCandidate[] | undefined>>;
}): string {
  const audience = plainAudienceOf(input.audienceKey);
  const lines: string[] = [
    '# 分かりやすさ診断',
    '',
    `- 対象読者: ${audience.label}`,
    `- 分野: ${input.field === 'medical' ? '医療・健康' : '一般'}`,
    `- 機械検出: ${input.issues.length}件 ／ AI判定（参考）: ${input.aiIssues.length}件`,
    '- ※ 言い換えは提案です。本文は書き換えていません。採用は元の文と読み比べてから。',
    '',
    '## 機械検出（確定）',
  ];
  if (input.issues.length === 0) lines.push('（なし）');
  input.issues.forEach((i, n) => {
    lines.push(`${n + 1}. **${ISSUE_KIND_DEFS[i.kind].label}**「${i.excerpt}」${i.detail ? ` — ${i.detail}` : ''}`);
    lines.push(`   - 元の文: ${i.sentence}`);
    for (const c of input.rephrases[i.id] ?? []) {
      lines.push(`   - 言い換え案: ${c.text}${c.note ? `（${c.note}）` : ''}`);
    }
  });
  lines.push('', '## AI判定（参考）');
  if (input.aiIssues.length === 0) lines.push('（なし）');
  input.aiIssues.forEach((a, n) => {
    lines.push(`${n + 1}. **${AI_ISSUE_KIND_DEFS[a.kind]}**「${a.excerpt}」 — ${a.note}`);
  });
  return `${lines.join('\n')}\n`;
}

export function plainSaveTitle(sourceText: string): string {
  const head = (sourceText ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
  return `分かりやすさ診断: ${head || '無題'}`;
}
