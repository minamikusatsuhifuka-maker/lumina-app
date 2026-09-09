// 315 §3-2: STEP1 図解プランの抽出（Gemini 既定・JSON）。提案のみ＝描画も保存もしない。
// 制約は二段構え: プロンプト（本文の語句のみ・ビフォーアフター禁止）＋コード側（parseVisualPlans で型を弾く・findForeignPhrases で印）
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_LOW } from '@/lib/ai-models';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { VISUAL_SOURCE_MAX_CHARS, buildVisualPlanPrompt, findBannedLabels, findForeignPhrases, findForeignTokens, isVisualType, parseVisualPlans, type VisualType } from '@/lib/visuals';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; types?: unknown };
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, VISUAL_SOURCE_MAX_CHARS) : '';
  // 317 §3-2: 選んだ種類だけプランを出す（素材パック）。未指定は従来どおり全種
  const types: VisualType[] = Array.isArray(body.types) ? body.types.filter(isVisualType) : [];
  if (text.length < 20) return NextResponse.json({ error: '元テキストが短すぎます（20字以上）' }, { status: 400 });
  try {
    const { system, prompt } = buildVisualPlanPrompt(text, { types });
    const raw = await generateWithModel('gemini', prompt, system, 8192, { responseMimeType: 'application/json', ...GEMINI_TEXT_THINKING_LOW });
    let parsed: unknown;
    try {
      parsed = robustJsonParse(raw);
    } catch {
      return NextResponse.json({ error: 'AI の出力を JSON として読めませんでした（もう一度お試しください）' }, { status: 502 });
    }
    const { plans, rejected } = parseVisualPlans(parsed, 'v', types);
    return NextResponse.json({
      plans,
      rejected: rejected.map((r) => r.reason),
      checks: Object.fromEntries(plans.map((p) => [p.id, { foreign: findForeignPhrases(p, text), foreignTokens: findForeignTokens(p, text), banned: findBannedLabels(p) }])),
      ranAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[visuals/plan]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'プランの抽出に失敗しました' }, { status: 500 });
  }
}
