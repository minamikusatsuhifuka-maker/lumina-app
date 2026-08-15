// API使用量を api_usage_logs に記録する共通ヘルパー
// 各機能のAPIルートから呼び出すことでコスト集計を一元化する
import { sql } from '@/lib/db';
import { CLAUDE_TEXT_MODEL, CLAUDE_OPUS_MODEL } from '@/lib/ai-models';

// 価格表（USD per 1M tokens、1USD=150JPY換算）
// 195: Sonnet 5=$3/$15（通常価格・院長判断で導入価格は載せない）、Opus実勢=$5/$25（誤値$15/$75を修正）。
// 旧sonnet-4-6のログはフォールバック（CLAUDE_TEXT_MODEL）でも同単価$3/$15のため専用エントリ不要
const PRICES: Record<string, { input: number; output: number }> = {
  [CLAUDE_TEXT_MODEL]: { input: 3, output: 15 },
  // 244: 現行Opus（Opus 5）を追加。単価はOpus 4.8と同じ$5/$25。
  // 旧IDは過去ログの単価解決に必要なので残す（消すと過去分が0円で集計される）
  [CLAUDE_OPUS_MODEL]: { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-haiku-4-5': { input: 0.25, output: 1.25 },
};
const USD_TO_JPY = 150;

interface TrackUsageArgs {
  userId: string;
  featureKey: string;
  stepLabel?: string | null;
  inputTokens: number;
  outputTokens: number;
  model?: string;
}

export async function trackUsage({
  userId,
  featureKey,
  stepLabel,
  inputTokens,
  outputTokens,
  model = CLAUDE_TEXT_MODEL,
}: TrackUsageArgs): Promise<void> {
  if (!userId) return;
  const inT = Math.max(0, Math.floor(inputTokens || 0));
  const outT = Math.max(0, Math.floor(outputTokens || 0));
  if (inT === 0 && outT === 0) return;

  const price = PRICES[model] ?? PRICES[CLAUDE_TEXT_MODEL];
  const costUsd = (inT * price.input + outT * price.output) / 1_000_000;
  const costJpy = Math.ceil(costUsd * USD_TO_JPY);

  try {
    await sql`
      INSERT INTO api_usage_logs
        (user_id, feature_key, step_label, input_tokens, output_tokens, cost_usd, cost_jpy, model)
      VALUES (
        ${userId}, ${featureKey}, ${stepLabel ?? null},
        ${inT}, ${outT}, ${costUsd}, ${costJpy}, ${model}
      )
    `;
  } catch (err) {
    // 記録失敗は呼び出し元の機能を止めないようにconsole出力のみ
    console.error('[trackUsage] 記録失敗:', err);
  }
}

// Anthropic SDKの usage オブジェクト形式から (input,output) を抽出
export function usageFromResponse(
  usage?: { input_tokens?: number; output_tokens?: number } | null,
): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
}
