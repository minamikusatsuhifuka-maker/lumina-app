import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Claudeモデル別の料金（USD per 1M tokens）
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-haiku-4-5': { input: 0.25, output: 1.25 },
};
const USD_JPY = 150;

interface PostBody {
  featureKey?: string;
  stepLabel?: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

// 使用量を記録
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const featureKey = body.featureKey ?? 'other';
  const stepLabel = body.stepLabel ?? null;
  const inputTokens = Math.max(0, Math.floor(body.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.floor(body.outputTokens ?? 0));
  const model = body.model ?? 'claude-sonnet-4-6';
  const price = PRICES[model] ?? PRICES['claude-sonnet-4-6'];
  const costUsd =
    (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  const costJpy = Math.ceil(costUsd * USD_JPY);

  const rows = await sql`
    INSERT INTO api_usage_logs
      (user_id, feature_key, step_label, input_tokens, output_tokens, cost_usd, cost_jpy, model)
    VALUES (
      ${userId}, ${featureKey}, ${stepLabel},
      ${inputTokens}, ${outputTokens},
      ${costUsd}, ${costJpy},
      ${model}
    )
    RETURNING *
  `;
  return NextResponse.json({ log: rows[0] });
}

// 使用量を取得（月次・日別・機能別）
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const year =
    parseInt(searchParams.get('year') ?? String(now.getFullYear()), 10) ||
    now.getFullYear();
  const month =
    parseInt(searchParams.get('month') ?? String(now.getMonth() + 1), 10) ||
    now.getMonth() + 1;

  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 1).toISOString();

  // 月次合計
  const monthlyRows = await sql`
    SELECT
      COALESCE(SUM(input_tokens), 0) AS total_input,
      COALESCE(SUM(output_tokens), 0) AS total_output,
      COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
      COALESCE(SUM(cost_jpy), 0) AS total_cost_jpy,
      COUNT(*) AS total_calls
    FROM api_usage_logs
    WHERE user_id = ${userId}
      AND recorded_at >= ${startDate}
      AND recorded_at < ${endDate}
  `;

  // 日別集計（Asia/Tokyoタイムゾーン）
  const daily = await sql`
    SELECT
      TO_CHAR(DATE(recorded_at AT TIME ZONE 'Asia/Tokyo'), 'YYYY-MM-DD') AS date,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(cost_jpy) AS cost_jpy,
      COUNT(*) AS calls
    FROM api_usage_logs
    WHERE user_id = ${userId}
      AND recorded_at >= ${startDate}
      AND recorded_at < ${endDate}
    GROUP BY DATE(recorded_at AT TIME ZONE 'Asia/Tokyo')
    ORDER BY date ASC
  `;

  // 機能別集計
  const byFeature = await sql`
    SELECT
      feature_key,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(cost_jpy) AS cost_jpy,
      COUNT(*) AS calls
    FROM api_usage_logs
    WHERE user_id = ${userId}
      AND recorded_at >= ${startDate}
      AND recorded_at < ${endDate}
    GROUP BY feature_key
    ORDER BY cost_jpy DESC
  `;

  // 直近7日間（グラフ用）
  const last7days = await sql`
    SELECT
      TO_CHAR(DATE(recorded_at AT TIME ZONE 'Asia/Tokyo'), 'YYYY-MM-DD') AS date,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(cost_jpy) AS cost_jpy
    FROM api_usage_logs
    WHERE user_id = ${userId}
      AND recorded_at >= NOW() - INTERVAL '7 days'
    GROUP BY DATE(recorded_at AT TIME ZONE 'Asia/Tokyo')
    ORDER BY date ASC
  `;

  return NextResponse.json({
    monthly: monthlyRows[0] ?? null,
    daily,
    byFeature,
    last7days,
  });
}
