// 315 §3-4: 決定的描画（表・フロー・比較・手順・概念図）。プランの文字列をそのまま satori で描く＝文字100%一致。
// fail-closed: 元テキストに無い語句・医療広告のNG表現・空は 400。描画した文字列とプランの一致を機械判定してから返す
import { NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { requireAuth } from '@/lib/require-auth';
import { fetchJpFontsWithFallback } from '@/lib/og-fonts';
import { missingGlyphMessage } from '@/lib/font-coverage';
import { VISUAL_DETERMINISTIC_TYPES, VISUAL_ORIENTATIONS, checkPlan, planBlockReason, type VisualOrientation, type VisualPlan } from '@/lib/visuals';
import { buildVisualElement, collectVisualText, verifyRenderedText } from '@/lib/visual-templates';
import { readPlanBody } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const read = readPlanBody(body);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  const { plan, sourceText } = read;
  // 317: 1枚サマリーに描画済みの図（data URI・PNG）を埋め込む。プランの検証には含めない（文字ではない）
  if (plan.type === 'onepage' && typeof body.embedImage === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.embedImage) && body.embedImage.length < 6_000_000) {
    plan.embedImage = body.embedImage;
  }
  if (!VISUAL_DETERMINISTIC_TYPES.includes(plan.type)) return NextResponse.json({ error: 'この型はコードで描画しません（イメージは /api/visuals/image）' }, { status: 400 });
  const orientation: VisualOrientation = VISUAL_ORIENTATIONS.includes(body.orientation as VisualOrientation) ? (body.orientation as VisualOrientation) : 'landscape';
  const check = checkPlan(plan as VisualPlan, sourceText);
  const reason = planBlockReason(check);
  if (reason) return NextResponse.json({ error: reason, check }, { status: 400 });
  try {
    const { element, canvas } = buildVisualElement(plan, orientation);
    const verified = verifyRenderedText(plan, element);
    if (!verified.ok) return NextResponse.json({ error: '描画する文字列がプランと一致しません', verified }, { status: 500 });
    // 315是正②: 欠字はフォールバック（Math → Symbols 2 → Sans）で補い、それでも無い文字があれば描かない（文字はプランどおりにしか描かない）
    const { fonts, missing, fallback } = await fetchJpFontsWithFallback(collectVisualText(plan));
    if (missing.length > 0) return NextResponse.json({ error: missingGlyphMessage(missing), missingGlyphs: missing }, { status: 400 });
    const img = new ImageResponse(element as never, { width: canvas.width, height: canvas.height, fonts });
    const buffer = Buffer.from(await img.arrayBuffer());
    if (buffer.length === 0) return NextResponse.json({ error: '画像の描画に失敗しました' }, { status: 500 });
    return NextResponse.json({ imageBase64: buffer.toString('base64'), width: canvas.width, height: canvas.height, textVerified: true, fallbackGlyphs: fallback, generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[visuals/render]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : '描画に失敗しました' }, { status: 500 });
  }
}
