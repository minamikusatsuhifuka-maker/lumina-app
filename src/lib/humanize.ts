// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 336: note記事・Kindle本の「✍️ 人間らしく整える」工程（DB非依存の純関数・定数・R-108）
//
// 位置: 生成（既存プロンプト・不変 R-88）→ 整える（AI・1回）→ 事実の機械検査（決定的）
//       → stripInlineLatex → [note のみ formatOneSentencePerLine → enforceNoteHeadingLevels]
//       → checkMedicalAd（後勝ち・R-69）→ 保存
// - 院長のプロンプト（HUMANIZE_EDITOR_PROMPT）は原文のまま。その後ろに安全の補則（HUMANIZE_SAFETY_ADDENDUM）を
//   連結して**後勝ち**にする（記事の内容は院長の実体験の範囲＝生成側が体験・実績・数字を補わない・309/312/316）
// - 事実の検査で「数字」が変わったら整えた版を採用しない（1回だけ整え直し→それでも駄目なら整える前を採用＝R-39）
// - AIらしい言い回し（findAiTells）は数えて表示するだけ。自動では削除しない
// - AI 呼び出し・マイ文体の読み出しは humanize-server.ts（サーバ専用）。このファイルはクライアントからも import できる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NO_LATEX_PROMPT_RULE } from './markdown-renderer';

/* ══════════════ §6 院長のプロンプト（原文・そのまま） ══════════════ */

export const HUMANIZE_EDITOR_PROMPT = `役割
あなたはプロの編集者です。与えられたテキストを、読者が AI で書いたかどうかを判定できないほど自然な文章に書き直してください。 元の意味と情報は保持し、すべてを改善します。
黄金ルール
文章は「自然」ですが、魂は失わないこと。機械的な声を削除し、人間らしい本物の声で書いてください。
削除すべき表現

1. 過剰に重要視する表現：「非常に重要」「極めて重要」「〜の観点から」「継続的な成長の観点で」などを削除し、具体的な事実・データに変更。
2. 抽象的で曖昧な表現：「例えば……」「〜のように……」「〜を促進……」「〜を証明……」などを、具体的な事実や実体験に置き換える。
3. 広告的な言い回し・煽り：「必見」「完全ガイド」「革命的」「運命を変える」「もう迷わない」などの誇張表現を削除し、より自然な表現に。
4. AI的な高頻度ワード：「重要なポイント」「コア」「必ず」「目立つ」「サポート」「促進」「実現」「ダイナミック」「発展」「進化」「複雑」などの言葉を、同義でもより自然な表現に言い換えるか削除。
5. 断定しすぎる表現：「必ず」「完全に」「構成する」「代表する」「と見なされる」などを削除し、より柔らかく体験ベースの表現に変更（「〜の場合がある」など）。
6. 否定の比較表現：「〜ではなく、Xである」「〜ではない、Yである」「〜だけでなく、〜でもある」などの不自然な対比を、自然な文章に書き換える。
7. 三段階の列挙表現：「第一に」「第二に」「第三に」などを避け、代わりに「主なポイントは」「例えば」など自然な流れに変更。
8. 受動態の多用：「〜される必要がある」を避け、「〜しておくべき」など主体的で自然な表現に書き換える。
9. AIっぽい構成・スタイル：過度な箇条書き（・、-）、記号、絵文字、すべて大文字のタイトル、文中の数字の羅列、README のような体裁を避ける。
10. チャットボット的な締め：「〜のお役に立てれば幸いです」「〜のために」「ご期待ください」「今後もご注目ください」など、AI特有の締めくくり表現を削除し、より自然で簡潔な終わり方にする。

人間らしい声で書く

* 文体を変化させる：文の長さを調整し、似た構造の文の連続を避ける。
* 自分の意見を入れる：実体験からの反応だけでなく、「私は〜だと思う」「〜より〜のほうが自然だ」など主観を適度に含める。
* 多少の不完全さを許容する：すべての情報を完璧に整理しない。
* 口語的な表現を使う：「実際のところ」「個人的には」など、より自然な言い回しを使う。
* 不完全でも一貫性を保つ：多少の口語、言い直し、語尾の揺れがあっても構わない。

口調を調整する（サンプルがある場合）
サンプルが提供されている場合は、文のリズム、語彙、記号の使い方、話し方の癖を分析し、同じような口調・スタイルで書き直してください。
必ず行うべき作業（3つ）

1. 作業 1：上記のルールに従って、全文を自然に書き直す。
2. 作業 2：読みやすさと自然さを確認し、機械的な痕跡が残っていないかチェックする。
3. 作業 3：修正後の最終版を提出する。

出力形式
修正後の最終テキストのみを出力する。解説、コメント、変更点の説明は不要。`;

/* ══════════════ §2-2 安全の補則（原文の後ろに連結＝後勝ち） ══════════════ */

export const HUMANIZE_SAFETY_ADDENDUM = `補則（上の規則と食い違う場合は、こちらを優先する）
- 元テキストに無い事実・数字・割合・固有名詞・症例・体験談を新たに加えない。「具体的な事実や実体験に置き換える」指示は、置き換える具体が元テキストの中にあるときだけ行う。無ければ、その表現を削るか平易にする。
- 数字と単位は値を変えない（言い回しだけ変えてよい）。元テキストにある数字は消さない。
- 効果・効能の断定、治療前後の対比、不安を煽る表現を加えない。
- 視点や感想の言い回し（「私は〜だと思う」等）は使ってよい。ただし新しい主張・効果の断定は加えない。
- Markdown の見出し構造（## と ### の階層と本数）、「▼ 有料ライン ▼」の目印の行、番号付きの手順（順序に意味があるもの）はそのまま保つ。手順の番号は消さない。
- ${NO_LATEX_PROMPT_RULE}
- 本文は Markdown のまま返す。前置き・解説・コードフェンスは付けない。`;

/** 数字の検査に当たったとき、1回だけ強めて整え直す（§2-3） */
export const HUMANIZE_NUMBER_RETRY_NOTE = `【最重要・再指示】前回の書き直しで、元テキストの数字が消えたり、無かった数字が現れたりしました。
今回は「数字・単位・割合・年・回数」を一字も変えず、消さず、増やさずに書き直してください。数字を含む文は、数字の部分をそのまま残して言い回しだけ整えてください。`;

/** 口調のサンプル（マイ文体・院長自身の文章のみの規約）を渡すときの見出し */
export const HUMANIZE_STYLE_SAMPLE_HEADING = '口調のサンプル（この人の文体で書き直す）';

/** system = 院長の原文 → 補則（後勝ち） → （あれば）口調のサンプル。本文は user に渡す（[ここに貼り付けてください] は使わない） */
export function buildHumanizeSystem(styleBlock = '', strengthenNumbers = false): string {
  const parts = [HUMANIZE_EDITOR_PROMPT, HUMANIZE_SAFETY_ADDENDUM];
  if (styleBlock.trim()) parts.push(`${HUMANIZE_STYLE_SAMPLE_HEADING}\n${styleBlock.trim()}`);
  if (strengthenNumbers) parts.push(HUMANIZE_NUMBER_RETRY_NOTE);
  return parts.join('\n\n');
}

/* ══════════════ §2-5 適用範囲（U80 と同じ方式で経路を固定） ══════════════ */

/** 整える工程を呼ぶ経路（src/ からの相対パス）。note は 1文1行・見出し規約も従来どおり当てる */
export const HUMANIZE_ROUTES_NOTE = [
  'app/api/dr-hub/persona/route.ts', // ①ペルソナ（309 マンダラ→note も①経由）
  'app/api/dr-hub/split/route.ts', // ②分割
  'app/api/kindle/to-note/route.ts', // 275 書籍→記事
  'app/api/kindle/note-remix/route.ts', // 269 remix
  'app/api/note-bundle/article/route.ts', // bundle
  'app/api/note-quick/article/route.ts', // quick
  'app/api/note-article/route.ts', // 旧 note記事生成（ストリーミング完了後）
] as const;

/** 整える工程を呼ぶが、1文1行・見出し規約は当てない経路（Kindle 本文・310 の固定は不変） */
export const HUMANIZE_ROUTES_KINDLE = [
  'app/api/kindle/generate-chapter/route.ts', // ウィザードの章本文・旧「Kindle書籍生成」の両モード
] as const;

/** 呼ばない経路（本便の範囲外）。ソース固定テストで「humanize を参照しない」ことを確かめる */
export const HUMANIZE_ROUTES_NEVER = [
  'app/api/dr-hub/x-post/route.ts', // X投稿（③・312）
  'app/api/deepresearch/route.ts', // DR
  'app/api/text-analysis/analyze/route.ts', // 分析
  'app/api/visuals/plan/route.ts', // 図解
  'app/api/seo/article/route.ts', // HP
  'app/api/hp-guard/route.ts', // HP ガード
  'app/api/presentation/page-script/route.ts', // プレゼン
  'app/api/metaphor/route.ts', // 喩え話
] as const;

export type HumanizeKind = 'note' | 'kindle';

/* ══════════════ 結果の型・理由・表示文 ══════════════ */

export type HumanizeReason = 'off' | 'timeout' | 'numbers' | 'length' | 'empty' | 'error';

export interface HumanizeInfo {
  /** 整えた版を採用したか */
  applied: boolean;
  /** applied=false のときの理由 */
  reason?: HumanizeReason;
  /** AIらしい言い回しの件数（整える前 → 後。採用しなかったときは同じ値） */
  tellsBefore: number;
  tellsAfter: number;
  /** 警告（採用は止めない）: 新しい固有名詞の疑い・新しい体験の疑い */
  warnings: string[];
  /** 整える前の本文（応答に含める。保存に持つかは humanizeMetadata が容量で判断） */
  before?: string;
  model: string;
  at: string;
  elapsedMs?: number;
  attempts?: number;
  chunks?: number;
  usage?: { input: number; output: number };
  /** 失敗の詳細（error のとき・表示用に短く） */
  detail?: string;
}

export const HUMANIZE_REASON_LABEL: Record<HumanizeReason, string> = {
  off: '整えていません（設定オフ）',
  timeout: '整えられませんでした（時間切れ）',
  numbers: '整えませんでした（数字が変わったため）',
  length: '整えませんでした（長さが大きく変わったため）',
  empty: '整えませんでした（結果が空だったため）',
  error: '整えられませんでした（エラー）',
};

export const HUMANIZE_LABEL = '✍️ 人間らしく整える';
export const HUMANIZE_BUSY_LABEL = '✍️ 整えています…';

/** 生成後に小さく出す1行（§2-6）。採用時は「✍️ 整え済み・AIらしい言い回し 14 → 2」 */
export function humanizeStatusLine(info: Pick<HumanizeInfo, 'applied' | 'reason' | 'tellsBefore' | 'tellsAfter'>): string {
  if (info.applied) return `✍️ 整え済み・AIらしい言い回し ${info.tellsBefore} → ${info.tellsAfter}`;
  return `✍️ ${HUMANIZE_REASON_LABEL[info.reason ?? 'error']}`;
}

/** 再試行を出す理由（時間切れ・エラー・空）。数字の検査と設定オフは再試行しても同じなので出さない */
export function humanizeCanRetry(info: Pick<HumanizeInfo, 'applied' | 'reason'>): boolean {
  return !info.applied && (info.reason === 'timeout' || info.reason === 'error' || info.reason === 'empty');
}

/** 端末に記憶する設定キー（既定オン＝ '0' が保存されているときだけオフ） */
export const HUMANIZE_STORAGE_KEY = 'lumina_humanize';

/* ══════════════ §2-8 保存（metadata.humanize・キー単位 R-113） ══════════════ */

/** 整える前の本文を metadata に持つ上限（超えたら before を落とす＝「整える前を見る」は生成直後のみ） */
export const HUMANIZE_BEFORE_MAX_CHARS = 20_000;

export type HumanizeMetadata = Omit<HumanizeInfo, 'before' | 'usage' | 'detail'> & { before?: string };

/** 保存用の形。applied=false でも記録は残す（理由が分かる）。before は容量で判断 */
export function humanizeMetadata(info: HumanizeInfo | null | undefined): HumanizeMetadata | null {
  if (!info || typeof info !== 'object') return null;
  const { before, usage: _usage, detail: _detail, ...rest } = info;
  void _usage;
  void _detail;
  const keepBefore = info.applied && typeof before === 'string' && before.length > 0 && before.length <= HUMANIZE_BEFORE_MAX_CHARS;
  return keepBefore ? { ...rest, before } : rest;
}

/** 読み出し側: 不正な形は無視（R-113）。画面のバッジ表示に使う最小の形だけ検証する */
export function parseHumanizeMetadata(raw: unknown): HumanizeMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.applied !== 'boolean') return null;
  const tellsBefore = Number(o.tellsBefore);
  const tellsAfter = Number(o.tellsAfter);
  if (!Number.isFinite(tellsBefore) || !Number.isFinite(tellsAfter)) return null;
  return {
    applied: o.applied,
    reason: typeof o.reason === 'string' && o.reason in HUMANIZE_REASON_LABEL ? (o.reason as HumanizeReason) : undefined,
    tellsBefore,
    tellsAfter,
    warnings: Array.isArray(o.warnings) ? o.warnings.map((w) => String(w)) : [],
    before: typeof o.before === 'string' ? o.before : undefined,
    model: typeof o.model === 'string' ? o.model : '',
    at: typeof o.at === 'string' ? o.at : '',
    elapsedMs: typeof o.elapsedMs === 'number' ? o.elapsedMs : undefined,
    attempts: typeof o.attempts === 'number' ? o.attempts : undefined,
    chunks: typeof o.chunks === 'number' ? o.chunks : undefined,
  };
}

/* ══════════════ §2-4 AIらしさの残り具合（決定的・表示のみ） ══════════════ */

/**
 * 語句で判定できるもの（§6 の10種から）。**院長が後から足せる**ようにここに文字列を追記するだけでよい。
 * 部分一致で数える（「非常に重要です」も1件）。文は壊さないので自動削除はしない。
 */
export const AI_TELL_PHRASES: readonly string[] = [
  // 1. 過剰に重要視
  '非常に重要',
  '極めて重要',
  'の観点から',
  '継続的な成長',
  // 3. 広告的・煽り
  '必見',
  '完全ガイド',
  '革命的',
  '運命を変える',
  'もう迷わない',
  // 4. AI的な高頻度ワード
  '重要なポイント',
  'を促進',
  'を実現',
  'ダイナミック',
  // 5. 断定しすぎ
  'と見なされ',
  // 7. 三段階の列挙
  '第一に',
  '第二に',
  '第三に',
  // 8. 受動態
  'される必要があ',
  // 10. チャットボット的な締め
  'お役に立てれば幸いです',
  'ご期待ください',
  '今後もご注目ください',
  '参考になれば幸いです',
];

/** 形で判定するもの（6. 否定の比較表現） */
export const AI_TELL_PATTERNS: readonly { label: string; re: RegExp }[] = [
  { label: '〜ではなく、〜である', re: /ではなく、[^。\n]{1,40}?(?:である|です|だ)。/g },
  { label: '〜だけでなく、〜でもある', re: /だけでなく、[^。\n]{1,40}?でもあ/g },
];

export interface AiTellHit {
  label: string;
  count: number;
}

export interface AiTellsResult {
  count: number;
  hits: AiTellHit[];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 固定の一覧で決定的に数える（同じ入力→同じ出力） */
export function findAiTells(text: string): AiTellsResult {
  const src = String(text ?? '');
  const hits: AiTellHit[] = [];
  let count = 0;
  for (const phrase of AI_TELL_PHRASES) {
    const n = src.match(new RegExp(escapeRe(phrase), 'g'))?.length ?? 0;
    if (n > 0) {
      hits.push({ label: phrase, count: n });
      count += n;
    }
  }
  for (const p of AI_TELL_PATTERNS) {
    const n = src.match(p.re)?.length ?? 0;
    if (n > 0) {
      hits.push({ label: p.label, count: n });
      count += n;
    }
  }
  return { count, hits };
}

/* ══════════════ §2-3 事実の機械検査（決定的） ══════════════ */

/** 全角の数字・小数点・カンマを半角へ。桁区切りのカンマは外す（1,000 → 1000） */
export function normalizeNumberText(text: string): string {
  return String(text ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, '.')
    .replace(/[，]/g, ',')
    .replace(/％/g, '%')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
}

/**
 * 検査の対象から外すもの: コードフェンス・インラインコード・URL・リンク先・行頭の番号付きリスト記号・見出し記号。
 * これらは「事実の数字」ではなく体裁（番号付きの手順は保持の対象だが、AI が「1.」→「まず」に言い換えても事実は変わらない）
 */
function stripNonFactual(text: string): string {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\]\([^)]*\)/g, '] ')
    .replace(/^\s*\d+[.)．）]\s+/gm, '')
    .replace(/^\s*#{1,6}\s+\d+[.)．）、]?\s*/gm, '');
}

/** 本文に現れる数値（重複なし・正規化済み） */
export function extractNumbers(text: string): string[] {
  const src = normalizeNumberText(stripNonFactual(text));
  const found = src.match(/\d+(?:\.\d+)?/g) ?? [];
  return Array.from(new Set(found));
}

export interface NumberDiff {
  /** 後にあって前に無い数値 */
  added: string[];
  /** 前にあって後に無い数値 */
  removed: string[];
}

export function diffNumbers(before: string, after: string): NumberDiff {
  const a = new Set(extractNumbers(before));
  const b = new Set(extractNumbers(after));
  return {
    added: Array.from(b).filter((n) => !a.has(n)),
    removed: Array.from(a).filter((n) => !b.has(n)),
  };
}

const KATAKANA_TERM_RE = /[ァ-ヶー]{4,}/g;
const LATIN_TERM_RE = /[A-Za-z][A-Za-z0-9-]{3,}/g;

/** 前に無いカタカナ語・英字語（4文字以上）が後に現れたか（警告のみ） */
export function findNewTerms(before: string, after: string): string[] {
  const pick = (t: string) => {
    const src = stripNonFactual(t);
    return new Set([...(src.match(KATAKANA_TERM_RE) ?? []), ...(src.match(LATIN_TERM_RE) ?? [])]);
  };
  const a = pick(before);
  return Array.from(pick(after)).filter((w) => !a.has(w));
}

/** 「当院では」「私の患者さん」「私が〜したとき」等の体験の言い回し（警告のみ） */
export const EXPERIENCE_PATTERNS: readonly RegExp[] = [
  /当院で/g,
  /私の患者/g,
  /私が[^。\n]{0,15}したとき/g,
  /私の経験(?:上|では|から)/g,
  /実際に(?:私|わたし)が/g,
  /うちの(?:クリニック|医院|院)/g,
  /私自身[^。\n]{0,10}(?:経験|試し|やって)/g,
  /診察室で/g,
];

export function findNewExperience(before: string, after: string): string[] {
  const out: string[] = [];
  for (const re of EXPERIENCE_PATTERNS) {
    const inAfter = after.match(re) ?? [];
    if (inAfter.length === 0) continue;
    const inBefore = before.match(re) ?? [];
    if (inBefore.length === 0) out.push(...Array.from(new Set(inAfter)));
  }
  return out;
}

export interface HumanizeFactCheck {
  /** 数字が増減していない */
  numbersOk: boolean;
  numbers: NumberDiff;
  /** 警告（採用は止めない） */
  warnings: string[];
}

export function checkHumanizeFacts(before: string, after: string): HumanizeFactCheck {
  const numbers = diffNumbers(before, after);
  const warnings: string[] = [];
  const terms = findNewTerms(before, after);
  if (terms.length > 0) warnings.push(`新しい固有名詞の疑い: ${terms.slice(0, 8).join('、')}${terms.length > 8 ? ` 他${terms.length - 8}件` : ''}`);
  const exp = findNewExperience(before, after);
  if (exp.length > 0) warnings.push(`新しい体験の疑い: ${exp.slice(0, 5).join('、')}`);
  return { numbersOk: numbers.added.length === 0 && numbers.removed.length === 0, numbers, warnings };
}

/** 長さの健全性（空・極端な増減は採用しない＝記事を失わない R-39） */
export const HUMANIZE_LENGTH_MIN_RATIO = 0.5;
export const HUMANIZE_LENGTH_MAX_RATIO = 2.0;

export function isLengthSane(before: string, after: string): boolean {
  const a = before.trim().length;
  const b = after.trim().length;
  if (a === 0) return b === 0;
  const r = b / a;
  return r >= HUMANIZE_LENGTH_MIN_RATIO && r <= HUMANIZE_LENGTH_MAX_RATIO;
}

/* ══════════════ §2-7 章の分割（長い章は見出しで分けて整え、つなぐ） ══════════════ */

/** 1回の整えに渡す本文の上限。実測（本番の章は平均3,609字・最大5,597字）ではまず超えない */
export const HUMANIZE_CHUNK_CHARS = 8_000;

/**
 * 上限を超える本文を「## / ### 見出しの直前」で分ける（上限以下なら1つ）。
 * 見出しが無くて分けられない部分は空行で分ける。同じ入力→同じ出力。
 */
export function splitForHumanize(text: string, maxChars = HUMANIZE_CHUNK_CHARS): string[] {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  if (src.length <= maxChars) return [src];
  const lines = src.split('\n');
  const sections: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (/^#{2,3}\s/.test(line) && cur.length > 0) {
      sections.push(cur.join('\n').replace(/\n+$/, ''));
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length > 0) sections.push(cur.join('\n').replace(/\n+$/, ''));
  // 見出し単位でも上限を超えるものは空行（段落）で分ける
  const pieces: string[] = [];
  for (const s of sections) {
    if (s.length <= maxChars) {
      pieces.push(s);
      continue;
    }
    let buf = '';
    for (const para of s.split(/\n{2,}/)) {
      const next = buf ? `${buf}\n\n${para}` : para;
      if (next.length > maxChars && buf) {
        pieces.push(buf);
        buf = para;
      } else {
        buf = next;
      }
    }
    if (buf) pieces.push(buf);
  }
  // 小さい断片は上限まで前と結合する（呼び出し回数を減らす）
  const out: string[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last !== undefined && `${last}\n\n${p}`.length <= maxChars) out[out.length - 1] = `${last}\n\n${p}`;
    else out.push(p);
  }
  return out;
}

/* ══════════════ §2-7 タイムアウト（R-73・R-118） ══════════════ */

/** 1回の整えの最悪所要（3,600字級・Gemini medium）に余裕を見た値 */
export const HUMANIZE_ATTEMPT_TIMEOUT_MS = 100_000;
/** 整え直しを含めた最大試行回数（初回＋数字の再指示1回） */
export const HUMANIZE_MAX_ATTEMPTS = 2;
/** ルートの maxDuration から引く余白（Vercel が関数を落とす前に終端を送る） */
export const HUMANIZE_ROUTE_MARGIN_MS = 20_000;
/** 整えた後に残す時間（checkMedicalAd・保存・応答） */
export const HUMANIZE_TAIL_RESERVE_MS = 15_000;
/** これより短い残り時間では呼ばない（呼んでも切れる） */
export const HUMANIZE_MIN_ATTEMPT_MS = 15_000;

/** ルートの開始時刻と maxDuration（秒）から、整える工程の締切（epoch ms）を出す */
export function humanizeDeadline(startedAt: number, maxDurationSec: number): number {
  return startedAt + maxDurationSec * 1000 - HUMANIZE_ROUTE_MARGIN_MS;
}

/** 今回の1回に使える時間（ms）。締切に足りなければ 0 */
export function humanizeAttemptBudget(deadlineAt: number | undefined, now: number): number {
  if (!deadlineAt) return HUMANIZE_ATTEMPT_TIMEOUT_MS;
  const remaining = deadlineAt - now - HUMANIZE_TAIL_RESERVE_MS;
  if (remaining < HUMANIZE_MIN_ATTEMPT_MS) return 0;
  return Math.min(HUMANIZE_ATTEMPT_TIMEOUT_MS, remaining);
}

/** /api/humanize 単体ルートの maxDuration（R-73: 試行2回×100秒＋余白 ＜ 300） */
export const HUMANIZE_API_MAX_DURATION_S = 300;

/** 出力枠: 入力とほぼ同量＋思考分（Gemini は geminiMaxTokens が予備枠を上乗せする） */
export function humanizeMaxTokens(chars: number): number {
  return Math.min(32_000, Math.max(8_000, Math.round(chars * 1.6) + 1_500));
}

export class HumanizeTimeoutError extends Error {
  constructor(message = '整える工程が時間切れになりました') {
    super(message);
    this.name = 'HumanizeTimeoutError';
  }
}

/* ══════════════ 整える → 検査 → 採用判定（AI呼び出しは差し込み・テスト可能） ══════════════ */

export interface HumanizeEditor {
  /** 1断片を書き直す。strengthenNumbers=true は数字の再指示つき。時間切れは HumanizeTimeoutError を投げる */
  (chunk: string, opts: { strengthenNumbers: boolean; attempt: number; chunkIndex: number }): Promise<string>;
}

export interface HumanizeOutcome {
  text: string;
  applied: boolean;
  reason?: HumanizeReason;
  warnings: string[];
  attempts: number;
  chunks: number;
  tellsBefore: number;
  tellsAfter: number;
  detail?: string;
}

/**
 * §2-3 の流れ: 整える → 数字の検査 → 当たれば1回だけ強めて整え直す → それでも当たれば整える前を採用（fail-closed・R-39）。
 * 固有名詞・体験の疑いは警告だけ（採用は止めない）。長い本文は断片ごとに整えてつなぐ。
 */
export async function humanizeWithChecks(before: string, editor: HumanizeEditor): Promise<HumanizeOutcome> {
  const src = String(before ?? '');
  const tellsBefore = findAiTells(src).count;
  const base = { tellsBefore, tellsAfter: tellsBefore, warnings: [] as string[], chunks: 0 };
  if (!src.trim()) return { text: src, applied: false, reason: 'empty', attempts: 0, ...base };
  const chunks = splitForHumanize(src);
  let attempts = 0;
  let lastReason: HumanizeReason = 'numbers';
  try {
    for (let attempt = 1; attempt <= HUMANIZE_MAX_ATTEMPTS; attempt++) {
      attempts = attempt;
      const strengthenNumbers = attempt > 1;
      const parts: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        parts.push(String(await editor(chunks[i], { strengthenNumbers, attempt, chunkIndex: i })).trim());
      }
      const after = parts.join('\n\n').trim();
      if (!after) {
        lastReason = 'empty';
        continue;
      }
      if (!isLengthSane(src, after)) {
        lastReason = 'length';
        continue;
      }
      const facts = checkHumanizeFacts(src, after);
      if (!facts.numbersOk) {
        lastReason = 'numbers';
        continue;
      }
      return {
        text: after,
        applied: true,
        warnings: facts.warnings,
        attempts,
        chunks: chunks.length,
        tellsBefore,
        tellsAfter: findAiTells(after).count,
      };
    }
    return { text: src, applied: false, reason: lastReason, attempts, ...base, chunks: chunks.length };
  } catch (e: unknown) {
    if (e instanceof HumanizeTimeoutError || (e as { name?: string })?.name === 'AbortError' || (e as { name?: string })?.name === 'TimeoutError') {
      return { text: src, applied: false, reason: 'timeout', attempts, ...base, chunks: chunks.length };
    }
    const detail = e instanceof Error ? e.message : String(e);
    return { text: src, applied: false, reason: 'error', attempts, ...base, chunks: chunks.length, detail: detail.slice(0, 200) };
  }
}

/** 設定オフのときの結果（API 応答の形をそろえる） */
export function humanizeSkipped(text: string, model: string, reason: HumanizeReason = 'off'): HumanizeInfo {
  const tells = findAiTells(text).count;
  return { applied: false, reason, tellsBefore: tells, tellsAfter: tells, warnings: [], model, at: new Date().toISOString() };
}
