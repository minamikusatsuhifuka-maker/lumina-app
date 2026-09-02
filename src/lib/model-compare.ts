// 290: ディープリサーチの「Gemini と Claude Opus 5 で並列実行して横並び比較」の純ロジック。
//
// 位置づけ（§1-2・R-88）: 既定の「リサーチ開始」は1文字も変えない。比較ボタンを押したときだけ、
// 既存の /api/deepresearch に `compare: 'gemini' | 'opus'` を載せた**2本のリクエスト**を並列に投げる
// （1リクエストに2モデルをまとめない・R-73）。判断（ラベル・保存名・タグ・使用量表記・タイムアウト）は
// ここに集め、画面と単体テスト（U59）が同じ関数を使う。
//
// ⚠ フォールバック（235/242）は比較経路では無効（§3）。両方 Gemini になれば比較の意味が消え、
//   「✨Geminiで生成」の表示を見落とすと同じモデルの出力2つを見比べることになる。
//   失敗した側は失敗として（理由つきで）列に出し、他方を巻き添えにしない（R-39）。

import {
  CLAUDE_OPUS_MODEL,
  CLAUDE_OPUS_MODEL_LABEL,
  GEMINI_TEXT_MODEL,
  GEMINI_TEXT_MODEL_LABEL,
} from '@/lib/ai-models';

/** 比較の2列。順序は固定（左＝既定モデルの Gemini・右＝Claude Opus 5） */
export type CompareSide = 'gemini' | 'opus';
export const COMPARE_SIDES: readonly CompareSide[] = ['gemini', 'opus'];

/** 列ヘッダーに出すモデル名（§5-3: どちらが Gemini でどちらが Opus 5 か明示する） */
export const COMPARE_SIDE_LABEL: Record<CompareSide, string> = {
  gemini: GEMINI_TEXT_MODEL_LABEL,
  opus: `Claude ${CLAUDE_OPUS_MODEL_LABEL}`,
};
export const COMPARE_SIDE_ICON: Record<CompareSide, string> = { gemini: '✨', opus: '🤖' };
/** 実際に呼ぶモデルID（ai-models.ts の定数を参照。直書き禁止・R-47） */
export const COMPARE_SIDE_MODEL_ID: Record<CompareSide, string> = {
  gemini: GEMINI_TEXT_MODEL,
  opus: CLAUDE_OPUS_MODEL,
};

/** 比較ボタンの表記（モデル名が分かる形・§5-1） */
export const COMPARE_BUTTON_LABEL = `⚖ ${COMPARE_SIDE_LABEL.gemini} と ${COMPARE_SIDE_LABEL.opus} で比較`;

/** リクエストボディの `compare` を検証する。未指定は null（＝従来経路）。不正値は undefined（400にする） */
export function parseCompareSide(v: unknown): CompareSide | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  return v === 'gemini' || v === 'opus' ? v : undefined;
}

/**
 * R-73: 内部タイムアウトの積算。比較経路はクライアントが1本につき1リクエスト・**リトライなし**で投げる
 * （429の再試行を挟むと 300秒×2 になり maxDuration を超える）。ルートの maxDuration（300）は
 * リテラルでしか書けない（R-83）ため、ここに正本の定数を置き、U59 でルートのソースと一致を固定する。
 */
export const DEEPRESEARCH_MAX_DURATION_S = 300;
/** クライアント側の打ち切り。サーバーの上限＋通信の余白（サーバーが先に切るのが正常系） */
export const COMPARE_CLIENT_TIMEOUT_MS = (DEEPRESEARCH_MAX_DURATION_S + 15) * 1000;
export const COMPARE_RETRIES = 0;

/** 1列の実行状態（画面の表示と下書き保存に使う） */
export type CompareRunStatus = 'running' | 'done' | 'error';
export interface CompareRunStats {
  /** 開始→完了（または失敗）までの所要 */
  elapsedMs: number;
  /** 生成本文の文字数 */
  chars: number;
  inputTokens?: number;
  outputTokens?: number;
}
export interface CompareRun {
  status: CompareRunStatus;
  text: string;
  /** 失敗の理由（空欄にしない・§3-2）。status==='error' のとき必ず入る */
  error?: string;
  stats?: CompareRunStats;
}

export const COMPARE_STATUS_LABEL: Record<CompareRunStatus, string> = {
  running: '⏳ 実行中',
  done: '✅ 完了',
  error: '❌ 失敗',
};

/** ストリームが done も error も返さずに閉じたとき（Vercel の時間切れで関数が落ちた等）の理由文 */
export const COMPARE_INCOMPLETE_MESSAGE =
  '応答が途中で終わりました（時間切れの可能性があります）。この列は保存されていません。もう一度お試しください。';
export const COMPARE_TIMEOUT_MESSAGE = `時間切れです（${DEEPRESEARCH_MAX_DURATION_S}秒）。この列は保存されていません。もう一度お試しください。`;

/**
 * §5-5/§5-6: 保存名にモデル名を含める。
 * 286のペアリングは「タイトル完全一致」で本文と要約を組むため、同題で本文2件（Gemini/Opus）を保存すると
 * 同種別は組まないので1枚に混ざることは無いが、**同じ名前のカードが2枚**並んで見分けがつかない。
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

/** metadata: どちらのモデルで生成したかと使用量（§6-3）。savedAt は SaveToLibraryButton が足す */
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

/** §6-3: 列ヘッダーに出す使用量。トークンが取れた側（Claude/Gemini とも usage あり）はそれも併記 */
export function compareUsageLabel(stats: CompareRunStats | undefined): string {
  if (!stats) return '';
  const parts = [`所要 ${formatElapsed(stats.elapsedMs)}`, `${stats.chars.toLocaleString()}字`];
  if (stats.inputTokens !== undefined || stats.outputTokens !== undefined) {
    parts.push(`入力 ${(stats.inputTokens ?? 0).toLocaleString()} tok ／ 出力 ${(stats.outputTokens ?? 0).toLocaleString()} tok`);
  }
  return parts.join(' ／ ');
}

/** 初期状態（両列とも実行中・本文なし） */
export function initialCompareRuns(): Record<CompareSide, CompareRun> {
  return { gemini: { status: 'running', text: '' }, opus: { status: 'running', text: '' } };
}

/** 全列が終わったか（完了・失敗を問わない。片方の失敗で他方を止めない・R-39） */
export function allCompareSettled(runs: Record<CompareSide, CompareRun>): boolean {
  return COMPARE_SIDES.every((s) => runs[s].status !== 'running');
}

/** 自動下書き（R-20）の feature_key。通常リサーチの 'deepresearch' とは分けて、既存の下書きを上書きしない */
export const COMPARE_DRAFT_FEATURE = 'deepresearch-compare';
export interface CompareDraftPayload {
  topic: string;
  depth: string;
  runs: Record<CompareSide, CompareRun>;
}
