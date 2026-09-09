// 290: ディープリサーチの「Gemini と Claude Opus 5 で並列実行して横並び比較」の純ロジック。
// 314: 3列目に GPT-6 Astra（OpenAI）を追加。開始前の確認ダイアログ（モデル選択・費用／所要時間の目安・保存件数）と、
//      モデルごとの個別タイムアウト＝「中断（時間切れ）」の状態、列ごとの再実行を足す。
//
// 位置づけ（§1-2・R-88）: 既定の「リサーチ開始」は1文字も変えない。比較ボタンを押したときだけ、
// 既存の /api/deepresearch に `compare: 'gemini' | 'opus' | 'gpt'` を載せた**モデル数ぶんのリクエスト**を並列に投げる
// （1リクエストに複数モデルをまとめない・R-73）。判断（ラベル・保存名・タグ・使用量表記・タイムアウト）は
// ここに集め、画面と単体テスト（U59／U85）が同じ関数を使う。
//
// ⚠ フォールバック（235/242）は比較経路では無効（§3・R-99）。失敗した側は失敗として（理由つきで）列に出し、他方を巻き添えにしない（R-39）。

import {
  CLAUDE_OPUS_MODEL,
  CLAUDE_OPUS_MODEL_LABEL,
  GEMINI_TEXT_MODEL,
  GEMINI_TEXT_MODEL_LABEL,
  OPENAI_GPT_MODEL,
  OPENAI_GPT_MODEL_LABEL,
} from '@/lib/ai-models';
import { isLikelyToTimeout } from '@/lib/model-pricing';

/** 比較の列。順序は固定（左＝既定モデルの Gemini・中＝Claude Opus 5・右＝GPT-6 Astra） */
export type CompareSide = 'gemini' | 'opus' | 'gpt';
export const COMPARE_SIDES: readonly CompareSide[] = ['gemini', 'opus', 'gpt'];
/** 314 §3-1: 既定の選択（現状と同じ Gemini＋Opus）。GPT はキー未設定なら選べない */
export const COMPARE_DEFAULT_SIDES: readonly CompareSide[] = ['gemini', 'opus'];
/** 同時に走らせる最少・上限（R-101） */
export const COMPARE_MIN_SIDES = 2;
export const COMPARE_MAX_SIDES = 3;

/** 列ヘッダーに出すモデル名（§5-3: どれがどのモデルか明示する） */
export const COMPARE_SIDE_LABEL: Record<CompareSide, string> = {
  gemini: GEMINI_TEXT_MODEL_LABEL,
  opus: `Claude ${CLAUDE_OPUS_MODEL_LABEL}`,
  gpt: OPENAI_GPT_MODEL_LABEL,
};
export const COMPARE_SIDE_ICON: Record<CompareSide, string> = { gemini: '✨', opus: '🤖', gpt: '🧠' };
/** 実際に呼ぶモデルID（ai-models.ts の定数を参照。直書き禁止・R-47） */
export const COMPARE_SIDE_MODEL_ID: Record<CompareSide, string> = {
  gemini: GEMINI_TEXT_MODEL,
  opus: CLAUDE_OPUS_MODEL,
  gpt: OPENAI_GPT_MODEL,
};

/** 比較ボタンの表記（モデル名が分かる形・§5-1。314: 3モデルを列挙） */
export const COMPARE_BUTTON_LABEL = `⚖ ${COMPARE_SIDE_LABEL.gemini}／${COMPARE_SIDE_LABEL.opus}／${COMPARE_SIDE_LABEL.gpt} で比較`;

/** リクエストボディの `compare` を検証する。未指定は null（＝従来経路）。不正値は undefined（400にする） */
export function parseCompareSide(v: unknown): CompareSide | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  return v === 'gemini' || v === 'opus' || v === 'gpt' ? v : undefined;
}

/** 選択の配列を検証・正規化（順序は COMPARE_SIDES・重複除去）。不正値は落とす */
export function normalizeCompareSides(v: unknown): CompareSide[] {
  const arr = Array.isArray(v) ? v : [];
  const set = new Set(arr.filter((x): x is CompareSide => x === 'gemini' || x === 'opus' || x === 'gpt'));
  return COMPARE_SIDES.filter((s) => set.has(s));
}

/**
 * R-73: 内部タイムアウトの積算。比較経路はクライアントが1本につき1リクエスト・**リトライなし**で投げる
 * （429の再試行を挟むと maxDuration×2 になり上限を超える）。ルートの maxDuration はリテラルでしか書けない（R-83）ため、
 * ここに正本の定数を置き、U59 でルートのソースと vercel.json の一致を固定する。
 * 314: Vercel Pro（Fluid compute・上限 800 秒）の範囲内で 300→600 に引き上げ（実測: Opus は 119〜286 秒で完走・上限直前の便あり）。
 */
export const DEEPRESEARCH_MAX_DURATION_S = 600;
/** 314 §3-2: サーバ側・モデルごとの個別タイムアウト。maxDuration より手前で必ず「中断」に落とす（関数が落ちて無音で閉じない） */
export const COMPARE_SERVER_TIMEOUT_MS = (DEEPRESEARCH_MAX_DURATION_S - 20) * 1000;
/** クライアント側の打ち切り。サーバーの上限＋通信の余白（サーバーが先に切るのが正常系） */
export const COMPARE_CLIENT_TIMEOUT_MS = (DEEPRESEARCH_MAX_DURATION_S + 15) * 1000;
export const COMPARE_RETRIES = 0;
/** 314 R-87: サーバ側の二重開始の遮断（同じ runId・同じ列は一定時間 409）。インスタンス内のベストエフォート */
export const COMPARE_RUN_DEDUPE_TTL_MS = 60_000;

/** 1列の実行状態（画面の表示と下書き保存に使う）。314: timeout＝中断（時間切れ・その列だけ・保存しない） */
export type CompareRunStatus = 'running' | 'done' | 'error' | 'timeout';
export interface CompareRunStats {
  /** 開始→完了（または失敗）までの所要 */
  elapsedMs: number;
  /** 生成本文の文字数 */
  chars: number;
  inputTokens?: number;
  outputTokens?: number;
  /** 314: 完了時刻（ISO・UTC）。表示は JST（R-86） */
  finishedAt?: string;
}
export interface CompareRun {
  status: CompareRunStatus;
  text: string;
  /** 失敗の理由（空欄にしない・§3-2）。status==='error'|'timeout' のとき必ず入る */
  error?: string;
  stats?: CompareRunStats;
  /** 314: この列の開始時刻（再実行で列ごとに変わる。画面の経過秒表示用・下書きにも残る） */
  startedAt?: number;
}
/** 314: 選んだ列だけを持つ（2〜3列） */
export type CompareRuns = Partial<Record<CompareSide, CompareRun>>;

export const COMPARE_STATUS_LABEL: Record<CompareRunStatus, string> = {
  running: '⏳ 実行中',
  done: '✅ 完了',
  error: '❌ 失敗',
  timeout: '⏸ 中断（時間切れ）',
};

/** ストリームが done も error も返さずに閉じたとき（Vercel の時間切れで関数が落ちた等）の理由文 */
export const COMPARE_INCOMPLETE_MESSAGE =
  '応答が途中で終わりました（時間切れの可能性があります）。この列は保存されていません。「再実行」でこの列だけやり直せます。';
export const COMPARE_TIMEOUT_MESSAGE = `時間切れです（上限 ${DEEPRESEARCH_MAX_DURATION_S}秒）。この列は保存されていません。「再実行」でこの列だけやり直せます。`;
/** 1つだけ選んだときの理由（R-101） */
export const COMPARE_MIN_SIDES_REASON = `比較になりません（${COMPARE_MIN_SIDES}つ以上のモデルを選んでください）`;
export const COMPARE_GPT_UNAVAILABLE_REASON = '未設定（院長が OPENAI_API_KEY を Vercel の環境変数に設定すると選べます）';
export const COMPARE_TIMEOUT_WARNING = '時間内に完了しない見込みです（既定で外しています。チェックすれば走らせます）';

/**
 * §5-5/§5-6: 保存名にモデル名を含める。
 * 286のペアリングは「タイトル完全一致」で本文と要約を組むため、同題で本文を複数保存すると
 * 同種別は組まないので1枚に混ざることは無いが、**同じ名前のカードが並んで**見分けがつかない。
 * 表示側（library-groups）は変えず、保存時にタイトルへ角括弧でモデル名を付ける＝カードの見た目で区別でき、
 * ペアリングの対象（完全一致）からも外れる（誤って組まない）。決定的（R-74）。
 */
export function compareSaveTitle(topic: string, side: CompareSide): string {
  const t = (topic || '').replace(/\s+/g, ' ').trim() || 'ディープリサーチ';
  return `${t}［${COMPARE_SIDE_LABEL[side]}］`;
}

/** タグ: 通常DRの「ディープリサーチ」に加え、比較由来とモデルIDを載せる（絞り込み・後からの識別用） */
export function compareSaveTags(side: CompareSide): string {
  return `ディープリサーチ,モデル比較,model:${COMPARE_SIDE_MODEL_ID[side]}`;
}

/** metadata: どのモデルで生成したかと使用量（§6-3）。savedAt は SaveToLibraryButton が足す */
export function compareSaveMetadata(side: CompareSide, stats?: CompareRunStats): Record<string, unknown> {
  return {
    compare: true,
    model: COMPARE_SIDE_MODEL_ID[side],
    modelLabel: COMPARE_SIDE_LABEL[side],
    ...(stats
      ? {
          elapsedMs: stats.elapsedMs,
          chars: stats.chars,
          ...(stats.inputTokens !== undefined ? { inputTokens: stats.inputTokens } : {}),
          ...(stats.outputTokens !== undefined ? { outputTokens: stats.outputTokens } : {}),
          ...(stats.finishedAt ? { finishedAt: stats.finishedAt } : {}),
        }
      : {}),
  };
}

/** 所要時間の表記（1分未満は秒、以上は「m分s秒」）。決定的 */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  return `${m}分${s % 60}秒`;
}

/** §6-3: 列ヘッダーに出す使用量。トークンが取れた側（Claude/Gemini/GPT とも usage あり）はそれも併記 */
export function compareUsageLabel(stats: CompareRunStats | undefined): string {
  if (!stats) return '';
  const parts = [`所要 ${formatElapsed(stats.elapsedMs)}`, `${stats.chars.toLocaleString()}字`];
  if (stats.inputTokens !== undefined || stats.outputTokens !== undefined) {
    parts.push(`入力 ${(stats.inputTokens ?? 0).toLocaleString()} tok ／ 出力 ${(stats.outputTokens ?? 0).toLocaleString()} tok`);
  }
  return parts.join(' ／ ');
}

/** 初期状態（選んだ列だけ実行中・本文なし）。省略時は既定の2列（290 互換） */
export function initialCompareRuns(sides: readonly CompareSide[] = COMPARE_DEFAULT_SIDES): CompareRuns {
  const out: CompareRuns = {};
  for (const s of COMPARE_SIDES) if (sides.includes(s)) out[s] = { status: 'running', text: '' };
  return out;
}

/** runs に含まれる列（COMPARE_SIDES の順） */
export function compareRunSides(runs: CompareRuns): CompareSide[] {
  return COMPARE_SIDES.filter((s) => runs[s] !== undefined);
}

/** 全列が終わったか（完了・失敗・中断を問わない。片方の失敗で他方を止めない・R-39） */
export function allCompareSettled(runs: CompareRuns): boolean {
  return compareRunSides(runs).every((s) => runs[s]!.status !== 'running');
}

/** 314: 再実行できる列（失敗・中断。実行中・完了は不可） */
export function isCompareRerunnable(run: CompareRun | undefined): boolean {
  return !!run && (run.status === 'error' || run.status === 'timeout');
}

/** 314 §3-1: 開始できるか（最少2つ・上限3・R-101） */
export function compareStartState(selected: readonly CompareSide[]): { enabled: boolean; reason: string | null } {
  const n = normalizeCompareSides([...selected]).length;
  if (n < COMPARE_MIN_SIDES) return { enabled: false, reason: COMPARE_MIN_SIDES_REASON };
  if (n > COMPARE_MAX_SIDES) return { enabled: false, reason: `同時に走らせるのは${COMPARE_MAX_SIDES}つまでです` };
  return { enabled: true, reason: null };
}

/**
 * 314 §3-1/§3-2: ダイアログの既定の選択。既定は Gemini＋Opus。使えないモデル（キー未設定）は外し、
 * 「完了しない見込み」（目安が maxDuration の 90% 超）のモデルも既定で外す（院長がチェックすれば走る）
 */
export function defaultCompareSelection(depth: string, availability: Record<CompareSide, boolean>, maxDurationS: number = DEEPRESEARCH_MAX_DURATION_S): CompareSide[] {
  return COMPARE_DEFAULT_SIDES.filter((s) => availability[s] && !isLikelyToTimeout(COMPARE_SIDE_MODEL_ID[s], depth, maxDurationS));
}

/** 「結果は n 件保存されます」（列ごとに保存＝選んだ数） */
export function compareSaveCountLabel(n: number): string {
  return `結果は列ごとに保存でき、最大 ${n} 件がリサーチ保存に入ります（時間切れ・失敗の列は保存されません）`;
}

/** 自動下書き（R-20）の feature_key。通常リサーチの 'deepresearch' とは分けて、既存の下書きを上書きしない */
export const COMPARE_DRAFT_FEATURE = 'deepresearch-compare';
export interface CompareDraftPayload {
  topic: string;
  depth: string;
  runs: CompareRuns;
}
