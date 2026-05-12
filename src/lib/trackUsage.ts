// API使用量を api_usage_logs に記録する共通ヘルパー
// 各機能のAPIルートから呼び出すことでコスト集計を一元化する
import { sql } from '@/lib/db';

// 価格表（USD per 1M tokens、1USD=150JPY換算）
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-opus-4-7': { input: 15, output: 75 },
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
  model = 'claude-sonnet-4-6',
}: TrackUsageArgs): Promise<void> {
  if (!userId) return;
  const inT = Math.max(0, Math.floor(inputTokens || 0));
  const outT = Math.max(0, Math.floor(outputTokens || 0));
  if (inT === 0 && outT === 0) return;

  const price = PRICES[model] ?? PRICES['claude-sonnet-4-6'];
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
