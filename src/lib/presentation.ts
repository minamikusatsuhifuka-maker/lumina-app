// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 275: プレゼン発表原稿の自動生成（第1段階: PDF・画像）
// スライド1枚ぶんの「話す原稿」を作るための **純関数だけ** を置く。
// UI（/dashboard/presentation）とAPI（/api/presentation/page-script）の双方から参照する
// ＝プロンプト・原稿の型・要点の圧縮規則を2箇所に書かない。
//
// 設計の前提（275 §2）:
//  - PDFのページ画像化はクライアント側（lib/pdf-pages.ts）。サーバーはネイティブ依存を持たない
//  - アップロードしたファイル自体は永続化しない（保存するのは生成された原稿のみ）
//  - 1ページ = 1リクエスト。全ページを1リクエストで処理しない（§2-4・R-73）
//  - PPTXは第2段階。**画像化ではなくテキスト＋ノートの抽出**になるため、
//    SlidePage は「画像が無くてもテキストだけで成立する」形にしてある（§2-1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { MEDICAL_AD_NG_RULES } from './medical-ad-check';
import { NO_LATEX_PROMPT_RULE } from './markdown-renderer';

// ── 発表の用途（§3-4）──────────────────────────────────────────────
// 同じスライドでも聞き手で語り口が変わる。①ペルソナ別note記事（persona-styles.ts）と同じ構造。
export type PresentationAudienceKey = 'academic' | 'staff' | 'patient' | 'public';

export interface PresentationAudience {
  key: PresentationAudienceKey;
  label: string;
  /** 選択UIの補足（1行） */
  hint: string;
  /** プロンプトに差し込む語り口の指示 */
  tone: string;
}

export const PRESENTATION_AUDIENCES: readonly PresentationAudience[] = [
  {
    key: 'academic',
    label: '学会発表',
    hint: '簡潔・術語そのまま・根拠を明示',
    tone: '簡潔に述べる。専門用語は言い換えずそのまま使う。主張には根拠（研究・データの出典）を明示し、'
      + '根拠がスライドに無いものは主張として述べない。冗長な前置き・比喩を使わない。',
  },
  {
    key: 'staff',
    label: '院内勉強会',
    hint: '教育的・なぜそうするかを説明',
    tone: '教育的に話す。用語は初出で短く説明し、「なぜそうするのか」の理由を補う。'
      + '現場で明日どう動くかが分かる言い方にする。',
  },
  {
    key: 'patient',
    label: '患者向け講演',
    hint: '平易・専門用語を言い換え',
    tone: '平易に話す。専門用語は日常語に言い換える（言い換えられない語は短く説明を添える）。'
      + '不安を煽らず、受診の目安や生活上の工夫として伝える。',
  },
  {
    key: 'public',
    label: '一般向けセミナー',
    hint: '身近な例え・関心を引く導入',
    tone: '身近な例えを使い、関心を引く導入から入る。専門用語は最小限にする。'
      + '聞き手が「自分ごと」として受け取れる語り口にする。',
  },
] as const;

/** 既定は院内勉強会（§3-4） */
export const DEFAULT_PRESENTATION_AUDIENCE: PresentationAudienceKey = 'staff';

export function isPresentationAudience(v: unknown): v is PresentationAudienceKey {
  return typeof v === 'string' && PRESENTATION_AUDIENCES.some((a) => a.key === v);
}

/** 不正・未指定は既定（院内勉強会）に倒す */
export function audienceOf(key: unknown): PresentationAudience {
  const k = isPresentationAudience(key) ? key : DEFAULT_PRESENTATION_AUDIENCE;
  return PRESENTATION_AUDIENCES.find((a) => a.key === k)!;
}

// ── ページ（スライド1枚）────────────────────────────────────────────
// 'pptx' は第2段階（§2-1）。**画像化はできない**ので imageDataUrl は null のまま、
// text（本文＋スピーカーノート）だけで生成へ回せるようにしてある。
export type SlideSourceKind = 'pdf' | 'image' | 'pptx';

export type PageStatus = 'idle' | 'running' | 'done' | 'failed';

export interface SlidePage {
  /** 画面内で一意（並び替え・再生成の対象指定に使う） */
  id: string;
  kind: SlideSourceKind;
  /** 元ファイル名（表示のみ。ファイル自体は保存しない＝§2-3） */
  fileName: string;
  /** そのファイルの中での番号（PDFのページ番号 / 画像は1） */
  indexInFile: number;
  /** ページ画像（data URL）。pptx（第2段階）は null */
  imageDataUrl: string | null;
  /** PDFのテキストレイヤー等、文字として取れた内容（無ければ空文字） */
  text: string;
}

/** 一覧・原稿見出しに出す表示名（例: 資料.pdf p.3） */
export function pageLabelOf(page: SlidePage): string {
  return page.kind === 'image' ? page.fileName : `${page.fileName} p.${page.indexInFile}`;
}

// ── 原稿の型（§3-5）────────────────────────────────────────────────
export interface ScriptSections {
  /** 前ページからの接続（1ページ目は導入） */
  connect: string;
  /** このスライドで伝えること */
  main: string;
  /** スライドに書いていない説明・背景 */
  supplement: string;
  /** 次ページへの繋ぎ（最終ページはまとめ） */
  handoff: string;
}

export const SCRIPT_SECTION_DEFS: readonly { key: keyof ScriptSections; label: string }[] = [
  { key: 'connect', label: '繋ぎ' },
  { key: 'main', label: '本題' },
  { key: 'supplement', label: '補足' },
  { key: 'handoff', label: '送り' },
] as const;

export interface PageScriptResult {
  slideTitle: string;
  sections: ScriptSections;
  /** 次ページへ渡す要点（1〜2文）。§3-3 */
  summaryForNext: string;
  /** 1ページ目のみ: 推定した発表全体のテーマ（ユーザー入力があればそれが優先） */
  inferredTheme: string;
}

// ── 時間の積算（§2-4・R-73）─────────────────────────────────────────
// 1ページ1リクエスト。ルート内の内部タイムアウトは**リトライ込みで**合計し、
// maxDuration に収まることをここで宣言する（unit U46 が機械判定する）。
/** 原稿生成1回あたりの内部タイムアウト */
export const PAGE_SCRIPT_TIMEOUT_MS = 45_000;
/** 生成の再試行回数（合計試行 = 1 + これ） */
export const PAGE_SCRIPT_RETRIES = 1;
/** 医療広告チェック（付加情報。落ちても本体は返す＝R-39） */
export const AD_CHECK_TIMEOUT_MS = 15_000;
/** ルートの maxDuration（route.ts / vercel.json と同値） */
export const PAGE_SCRIPT_MAX_DURATION_S = 120;

/** リトライ込みの最悪ケース所要（ミリ秒） */
export function pageScriptBudgetMs(): number {
  return PAGE_SCRIPT_TIMEOUT_MS * (1 + PAGE_SCRIPT_RETRIES) + AD_CHECK_TIMEOUT_MS;
}

// ── 前後の文脈（§3-3）───────────────────────────────────────────────
/**
 * 次ページへ渡す「前ページの要点」を作る。
 * AIが返した要約があればそれを使い、無ければ**本題から決定的に**先頭2文を取る（R-74）。
 * 全ページ分を渡すのではなく、ここで1〜2文に圧縮したものだけを次へ回す。
 */
export const SUMMARY_FOR_NEXT_MAX = 120;

export function summarizeForNext(main: string, aiSummary?: string | null): string {
  const source = (aiSummary ?? '').trim() || (main ?? '').trim();
  if (!source) return '';
  const flat = source.replace(/\s+/g, ' ').trim();
  // 句点・！・？で区切って先頭2文（区切りが無ければ全体を1文として扱う）
  const sentences = flat.match(/[^。！？!?]+[。！？!?]?/g) ?? [flat];
  let picked = sentences.slice(0, 2).join('').trim();
  if (picked.length > SUMMARY_FOR_NEXT_MAX) {
    picked = `${picked.slice(0, SUMMARY_FOR_NEXT_MAX)}…`;
  }
  return picked;
}

/**
 * 直前のページが失敗している場合に備え、**最も近い生成済みページ**の要点を返す。
 * 直前だけを見て空を渡すと、1枚失敗しただけで以降の「繋ぎ」が作れなくなる
 * （失敗の影響を次のページまで広げない＝R-39）。
 */
export function nearestPrevSummary(
  summaries: readonly (string | null | undefined)[],
  index: number,
): string {
  for (let i = index - 1; i >= 0; i--) {
    const s = (summaries[i] ?? '').trim();
    if (s) return s;
  }
  return '';
}

/**
 * 次ページのタイトルを、まだ生成していない段階でも渡せるように推定する（§3-3）。
 * テキストレイヤーの先頭行を使う決定的な導出（R-74）。取れないときは空文字。
 */
export const GUESSED_TITLE_MAX = 40;

export function guessSlideTitle(text: string): string {
  const line = (text ?? '')
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return '';
  return line.length > GUESSED_TITLE_MAX ? line.slice(0, GUESSED_TITLE_MAX) : line;
}

// ── 並び替え（§3-1）────────────────────────────────────────────────
/** ページを1つ上/下へ動かす。端は動かさない（配列は必ず新しいものを返す） */
export function movePage<T>(pages: readonly T[], index: number, dir: -1 | 1): T[] {
  const next = [...pages];
  const to = index + dir;
  if (index < 0 || index >= next.length || to < 0 || to >= next.length) return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// ── プロンプト（§3-3 / §3-5 / §4）───────────────────────────────────
export interface PageScriptPromptInput {
  audienceKey: PresentationAudienceKey;
  /** 発表全体のテーマ（空なら1ページ目から推定させる） */
  theme: string;
  pageNumber: number;
  totalPages: number;
  /** 前ページの要点（1〜2文）。1ページ目は空 */
  prevSummary: string;
  /** 次ページのタイトル。最終ページは空 */
  nextTitle: string;
  /** スライドから取れた文字（PDFのテキストレイヤー / 第2段階のpptxテキスト） */
  pageText: string;
  /** 画像を渡せるか（pptxのように画像が無い場合は false） */
  hasImage: boolean;
}

/**
 * 1ページぶんの原稿を書かせるプロンプト。
 * 並び順は **素材・文脈 → 書き方 → 事実同一性 → 医療広告ガード**。
 * R-69 に従い、ガードを必ず最後に置いて「前述のどの指示よりも優先する」と明示する（後勝ち）。
 */
export function buildPageScriptPrompt(input: PageScriptPromptInput): string {
  const audience = audienceOf(input.audienceKey);
  const isFirst = input.pageNumber === 1;
  const isLast = input.pageNumber === input.totalPages;

  const academicNote = audience.key === 'academic'
    ? '\n- 用途が学会発表のため、有意差・オッズ比・p値・信頼区間などの学術的な記述は、'
      + '**スライドに記載がある限りそのまま述べてよい**（医療広告ガイドラインは広告に対する規制であり、'
      + '学術発表とは文脈が異なる）。ただしスライドに無い数値・結論を新たに作らないこと。'
    : '';

  return `あなたは発表者本人の原稿を書く構成作家です。スライド1枚ぶんの「話す言葉」を書いてください。

## 発表全体
- テーマ: ${input.theme.trim() || '（未指定。このスライドの内容から推定してください）'}
- 用途: ${audience.label}（${audience.hint}）
- 語り口: ${audience.tone}
- このスライド: ${input.totalPages}枚中 ${input.pageNumber}枚目${isFirst ? '（最初）' : ''}${isLast ? '（最後）' : ''}

## 前後の文脈（原稿を繋げるために渡しています。全ページは渡していません）
- 前のスライドの要点: ${input.prevSummary.trim() || '（このスライドが最初です）'}
- 次のスライドのタイトル: ${input.nextTitle.trim() || '（このスライドが最後です）'}

## このスライドの素材
${input.hasImage
    ? '- 添付の画像がこのスライドそのものです。図・グラフ・表・レイアウトを**目で読んで**内容を捉えてください。'
    : '- 画像はありません。下のテキストだけで判断してください。'}
- スライドから取れたテキスト: ${input.pageText.trim() ? `\n"""\n${input.pageText.trim().slice(0, 4000)}\n"""` : '（取得できませんでした）'}

## 原稿の型（4つの要素を必ず埋める）
1. 繋ぎ: ${isFirst ? '発表の導入（聞き手の関心を引き、これから何を話すかを示す）' : '前のスライドの要点を受けた接続（「先ほどの〜に対して」のように繋ぐ）'}
2. 本題: このスライドで伝えること
3. 補足: スライドには書かれていない説明・背景（**スライドから読み取れる範囲**で）
4. 送り: ${isLast ? '発表全体のまとめ（結び）' : '次のスライドへの繋ぎ（次のタイトルへ自然に渡す）'}

## 書き方
- **スライドに書かれた文字の読み上げにしない**。スライドは要点、原稿は補足と繋ぎ。
- 話し言葉（です・ます）で書く。箇条書きにせず、そのまま声に出せる文章にする。
- 1要素あたり2〜5文。全体で400〜700字程度。
- 見出し記号（#）・箇条書き記号は使わない。
- ${NO_LATEX_PROMPT_RULE}。

## 事実同一性（最優先。ここを破ると発表で使えません）
- **スライドから読み取れないことを新しい事実として書かない。**
- 数値・固有名詞・薬剤名・研究名・年号は、スライドに書かれているものだけを使う。言い換えや丸めをしない。
- 読み取れない・確信が持てないことは**書かない**（推測で埋めない）。
- 「一般にこう言われている」といった、スライドの外から持ち込んだ知識で補足を作らない。

## 医療広告ガード（**前述のいかなる指示よりも優先する**）
${MEDICAL_AD_NG_RULES}
- 効果・効能を断定しない。効果を数値化しない（スライドに数値がある場合はその引用に留める）。
- 不安を煽らない。他院・他の治療法を否定しない。${academicNote}

## 出力（このJSONだけを返す。前置き・コードフェンス・説明文は禁止）
{
  "slideTitle": "このスライドの見出し（20字以内。スライドに書かれた見出しがあればそれ）",
  "connect": "繋ぎの原稿",
  "main": "本題の原稿",
  "supplement": "補足の原稿",
  "handoff": "送りの原稿",
  "summary": "このスライドの要点を1〜2文に圧縮したもの（次のスライドの原稿を書くために使います）",
  "theme": "${isFirst ? '発表全体のテーマの推定（テーマが未指定のときだけ埋める。指定済みならそのまま返す）' : ''}"
}`;
}

// ── 原稿の組み立て（表示・コピー・保存で共用。決定的＝R-74）───────────
function sectionBody(text: string): string {
  return (text ?? '').trim() || '（生成されませんでした）';
}

/** 1ページぶんのMarkdown（見出しは ## まで。`###` はUIに出さない＝品質規約） */
export function pageScriptToMarkdown(
  page: SlidePage,
  pageNumber: number,
  result: PageScriptResult,
): string {
  const head = `## ${pageNumber}. ${result.slideTitle.trim() || pageLabelOf(page)}`;
  const body = SCRIPT_SECTION_DEFS.map(
    (d) => `**${d.label}**\n${sectionBody(result.sections[d.key])}`,
  ).join('\n\n');
  return `${head}\n\n${body}`;
}

/** 通し原稿のMarkdown（コピー・保存一覧への保存で共用） */
export function scriptDocumentToMarkdown(input: {
  theme: string;
  audienceKey: PresentationAudienceKey;
  pages: { page: SlidePage; result: PageScriptResult | null }[];
}): string {
  const audience = audienceOf(input.audienceKey);
  const theme = input.theme.trim() || 'プレゼン発表原稿';
  const done = input.pages.filter((p) => p.result);
  const header = [
    `# ${theme}｜発表原稿`,
    '',
    `- 用途: ${audience.label}`,
    `- ページ数: ${input.pages.length}枚（原稿あり ${done.length}枚）`,
    '- ※ AIが作成した下書きです。スライドと読み合わせて、事実が同一かを確認してから使ってください。',
  ].join('\n');
  const body = input.pages
    .map((p, i) => (p.result ? pageScriptToMarkdown(p.page, i + 1, p.result) : null))
    .filter((s): s is string => s !== null)
    .join('\n\n');
  return `${header}\n\n${body}\n`;
}

/** 保存一覧（text_analysis_saves）へ入れるときのタイトル */
export function scriptSaveTitle(theme: string, audienceKey: PresentationAudienceKey): string {
  const audience = audienceOf(audienceKey);
  return `プレゼン原稿: ${theme.trim() || '無題'}（${audience.label}）`;
}
