// 314 §3-1: 比較ダイアログのための「使えるモデル」（キーの有無だけ。値は返さない・読んで表示もしない）
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { hasOpenAIKey } from '@/lib/openai-research';
import { DEEPRESEARCH_MAX_DURATION_S, type CompareSide } from '@/lib/model-compare';

export const runtime = 'nodejs';

export async function GET() {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const availability: Record<CompareSide, boolean> = {
    gemini: true,
    opus: typeof anthropic === 'string' && anthropic.trim() !== '' && anthropic !== 'your_api_key_here',
    gpt: hasOpenAIKey(),
  };
  return NextResponse.json({ availability, maxDurationS: DEEPRESEARCH_MAX_DURATION_S });
}
