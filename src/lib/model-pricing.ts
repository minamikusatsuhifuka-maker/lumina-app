// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 314 §3-1-1: ディープリサーチ並列比較の「費用の目安」「所要時間の目安」（純関数・DB 非依存・決定的・R-74／R-108）
//
// - 単価（USD per 1M tokens）は 2026/9/9 の公開情報。**有効期日**と**確認日**を定数に持ち、画面には「目安・確認日」を添える。
//   Gemini 3.7 Flash は 2026/12/31 まで $0.75/$3.75、2027/1/1 から $1.50/$7.50（切り替えの判定は JST・R-86）。
// - 推定トークン: 入力＝実際に送るプロンプトの文字数（お題＋system/user の定型）、出力＝分量の目標文字数。
//   日本語は 1文字≈1トークンとして**保守的に**見積もる。Opus と GPT は思考／推論トークンが出力扱いのため出力を 2 倍。
// - 「上限ではない・煽らない・断定しない」＝表示語は「約 $0.xx（目安）」。既存の課金設定・残高は読まない（停止条件②の範囲外）。
// - 所要時間の目安は実測ベース（library.metadata.elapsedMs の完走分: Gemini 19〜31秒／Opus 119〜286秒）。GPT は未計測＝null。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { CLAUDE_OPUS_MODEL, GEMINI_TEXT_MODEL, OPENAI_GPT_MODEL, OPENAI_IMAGE_25_FLARE, OPENAI_IMAGE_25_SUNBURST } from '@/lib/ai-models';
import { jstDateString } from '@/lib/jst';

/** 単価を確認した日（画面に添える） */
export const PRICING_CHECKED_ON = '2026-09-09';

export interface ModelUnitPrice {
  modelId: string;
  /** USD per 1M input tokens */
  inputPerM: number;
  /** USD per 1M output tokens */
  outputPerM: number;
  /** この単価が有効な最初の日（JST 'YYYY-MM-DD'）。無ければ最初から */
  validFrom?: string;
  /** この単価が有効な最後の日（JST 'YYYY-MM-DD'）。無ければ期限なし */
  validUntil?: string;
  /** 思考／推論トークンが出力扱いで課金されるモデル＝出力を 2 倍で見積もる */
  reasoningInOutput: boolean;
}

/** 単価表（正本はここ1箇所。順序は「同じモデルなら validFrom 昇順」） */
export const MODEL_UNIT_PRICES: readonly ModelUnitPrice[] = [
  { modelId: GEMINI_TEXT_MODEL, inputPerM: 0.75, outputPerM: 3.75, validUntil: '2026-12-31', reasoningInOutput: false },
  { modelId: GEMINI_TEXT_MODEL, inputPerM: 1.5, outputPerM: 7.5, validFrom: '2027-01-01', reasoningInOutput: false },
  { modelId: CLAUDE_OPUS_MODEL, inputPerM: 5, outputPerM: 25, reasoningInOutput: true },
  { modelId: OPENAI_GPT_MODEL, inputPerM: 10, outputPerM: 50, reasoningInOutput: true },
];

/** その日（JST 'YYYY-MM-DD'）に有効な単価。無ければ null（＝表示しない。推定値を作らない） */
export function unitPriceOn(modelId: string, jstDate: string = jstDateString()): ModelUnitPrice | null {
  for (const p of MODEL_UNIT_PRICES) {
    if (p.modelId !== modelId) continue;
    if (p.validFrom && jstDate < p.validFrom) continue;
    if (p.validUntil && jstDate > p.validUntil) continue;
    return p;
  }
  return null;
}

/** 分量ごとの出力の目標文字数（ルートの depthPrompts と同じ数字） */
export const DEPTH_TARGET_CHARS: Record<string, number> = { quick: 1500, standard: 3000, deep: 5000 };
/**
 * お題以外に入力として課金されるトークンの概算（モデルごと・保守的）。定型プロンプト（system＋user・クリニック背景）に加え、
 * Web 検索の結果がモデルへの入力として数えられる（実測: Opus quick 6,755 tok（290）／GPT-6 Astra quick 22,963 tok（314 B35））
 */
export const COMPARE_INPUT_OVERHEAD_TOKENS: Record<string, number> = {
  [GEMINI_TEXT_MODEL]: 1500,
  [CLAUDE_OPUS_MODEL]: 7000,
  [OPENAI_GPT_MODEL]: 23000,
};
/** 単価表に無いモデルの定型ぶん */
export const COMPARE_PROMPT_OVERHEAD_CHARS = 1500;
/** 思考／推論トークンが出力扱いのモデルの出力倍率 */
export const REASONING_OUTPUT_MULTIPLIER = 2;

export interface CostEstimate {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  unit: ModelUnitPrice;
}

/** 推定トークン（日本語 1文字≈1トークン・保守的）。出力は思考分を倍率で見込む */
export function estimateTokens(modelId: string, depth: string, topicChars: number, jstDate: string = jstDateString()): { input: number; output: number } | null {
  const unit = unitPriceOn(modelId, jstDate);
  if (!unit) return null;
  const input = Math.max(0, Math.floor(topicChars)) + (COMPARE_INPUT_OVERHEAD_TOKENS[modelId] ?? COMPARE_PROMPT_OVERHEAD_CHARS);
  const base = DEPTH_TARGET_CHARS[depth] ?? DEPTH_TARGET_CHARS.standard;
  const output = unit.reasoningInOutput ? base * REASONING_OUTPUT_MULTIPLIER : base;
  return { input, output };
}

/** 費用（USD）。同じ入力→同じ出力。単価が無ければ null */
export function costOf(modelId: string, inputTokens: number, outputTokens: number, jstDate: string = jstDateString()): number | null {
  const unit = unitPriceOn(modelId, jstDate);
  if (!unit) return null;
  return (inputTokens / 1_000_000) * unit.inputPerM + (outputTokens / 1_000_000) * unit.outputPerM;
}

/** 目安（推定トークン×単価） */
export function estimateCost(modelId: string, depth: string, topicChars: number, jstDate: string = jstDateString()): CostEstimate | null {
  const unit = unitPriceOn(modelId, jstDate);
  const t = estimateTokens(modelId, depth, topicChars, jstDate);
  if (!unit || !t) return null;
  return { modelId, inputTokens: t.input, outputTokens: t.output, usd: costOf(modelId, t.input, t.output, jstDate) ?? 0, unit };
}

/** 「約 $0.12」。1セント未満は「$0.01 未満」。断定しない語 */
export function formatUsd(usd: number): string {
  if (usd < 0.005) return '$0.01 未満';
  return `約 $${usd.toFixed(2)}`;
}

/** 表示の添え書き（目安・上限ではない・確認日） */
export function pricingNote(jstDate: string = jstDateString()): string {
  const g = unitPriceOn(GEMINI_TEXT_MODEL, jstDate);
  const until = g?.validUntil ? `（Gemini の単価は ${g.validUntil} まで）` : '';
  return `目安・上限ではありません。単価は ${PRICING_CHECKED_ON} 確認${until}`;
}

// ───────────────────────────────────────────────────────────────────────────
// 所要時間の目安（実測ベース・定数1箇所）と「完了しない見込み」の事前判定
// ───────────────────────────────────────────────────────────────────────────

/** モデル×分量の所要時間の目安（秒）。null＝未計測（GPT は quick だけ 314 B35 で実測 40 秒） */
export const COMPARE_ESTIMATED_SECONDS: Record<string, Record<string, number | null>> = {
  [GEMINI_TEXT_MODEL]: { quick: 20, standard: 25, deep: 35 },
  [CLAUDE_OPUS_MODEL]: { quick: 80, standard: 180, deep: 300 },
  [OPENAI_GPT_MODEL]: { quick: 40, standard: null, deep: null },
};

export function estimatedSeconds(modelId: string, depth: string): number | null {
  return COMPARE_ESTIMATED_SECONDS[modelId]?.[depth] ?? null;
}

/** 目安が maxDuration のこの割合を超える組み合わせは「完了しない見込み」＝警告して既定で外す */
export const COMPARE_TIME_WARN_RATIO = 0.9;

export function isLikelyToTimeout(modelId: string, depth: string, maxDurationS: number): boolean {
  const s = estimatedSeconds(modelId, depth);
  return s !== null && s > maxDurationS * COMPARE_TIME_WARN_RATIO;
}

/** 所要時間の表示語（目安・未計測） */
export function estimatedSecondsLabel(modelId: string, depth: string): string {
  const s = estimatedSeconds(modelId, depth);
  if (s === null) return '未計測';
  if (s < 60) return `約${s}秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `約${m}分` : `約${m}分${r}秒`;
}

// ───────────────────────────────────────────────────────────────────────────
// 315: GPT Image 2.5 の単価（トークン制・2026/9/9 確認）。テキスト入力 $5／画像入力 $8／画像出力 $30（各 1M tokens）
// 1枚の目安＝出力トークン（品質×サイズ・GPT Image 系の公開値）×$30/1M ＋ プロンプト文字数×$5/1M
// ───────────────────────────────────────────────────────────────────────────

export const IMAGE_PRICING_CHECKED_ON = '2026-09-09';
export const IMAGE_UNIT_PRICES = { textInputPerM: 5, imageInputPerM: 8, imageOutputPerM: 30 } as const;
export const IMAGE_MODEL_IDS = { flare: OPENAI_IMAGE_25_FLARE, sunburst: OPENAI_IMAGE_25_SUNBURST } as const;
export type ImageQualityKey = 'low' | 'medium' | 'high';
export type ImageAspectKey = 'square' | 'landscape' | 'portrait';
/** 画像出力トークン（品質×サイズ）。1024×1024 / 1536×1024 / 1024×1536（GPT Image 系の公開値） */
export const IMAGE_OUTPUT_TOKENS: Record<ImageQualityKey, Record<ImageAspectKey, number>> = {
  low: { square: 272, landscape: 408, portrait: 400 },
  medium: { square: 1056, landscape: 1584, portrait: 1568 },
  high: { square: 4160, landscape: 6240, portrait: 6208 },
};

export interface ImageCostEstimate {
  outputTokens: number;
  promptTokens: number;
  usd: number;
}

/** 1枚の目安（決定的・R-74）。promptChars は日本語 1文字≈1トークンで保守的に */
export function estimateImageCost(quality: ImageQualityKey, aspect: ImageAspectKey, promptChars: number): ImageCostEstimate {
  const outputTokens = IMAGE_OUTPUT_TOKENS[quality][aspect];
  const promptTokens = Math.max(0, Math.floor(promptChars));
  const usd = (outputTokens / 1_000_000) * IMAGE_UNIT_PRICES.imageOutputPerM + (promptTokens / 1_000_000) * IMAGE_UNIT_PRICES.textInputPerM;
  return { outputTokens, promptTokens, usd };
}

/** 実績（API の usage が取れたとき）。取れなければ null＝出さない */
export function imageCostActual(usage: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { image_tokens?: number; text_tokens?: number } } | null | undefined): number | null {
  if (!usage || typeof usage.output_tokens !== 'number') return null;
  const textIn = usage.input_tokens_details?.text_tokens ?? usage.input_tokens ?? 0;
  const imageIn = usage.input_tokens_details?.image_tokens ?? 0;
  return (usage.output_tokens / 1_000_000) * IMAGE_UNIT_PRICES.imageOutputPerM + (textIn / 1_000_000) * IMAGE_UNIT_PRICES.textInputPerM + (imageIn / 1_000_000) * IMAGE_UNIT_PRICES.imageInputPerM;
}

export function imagePricingNote(): string {
  return `目安・上限ではありません。単価は ${IMAGE_PRICING_CHECKED_ON} 確認（画像出力 $${IMAGE_UNIT_PRICES.imageOutputPerM}/1M tokens）`;
}
