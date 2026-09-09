// 315 §3-4: イメージ（GPT Image 2.5）。既定は「絵柄は AI・文字はコード」＝文字なしで生成してプランの文字を satori で重ねる。
// 「AIに文字も描かせる」（aiText）はオプトイン＝プランの文字列をそのまま渡す（要約させない）。
// - 医療広告ガード: プロンプトは image-guards（サーバで常時連結・後勝ち・R-69）、ラベルは checkPlan（決定的）
// - 冪等: 同じプラン・同じ設定（＋同じ利用者）の再送は同じ画像を返す（インスタンス内・TTL 10分・R-87）
// - 未提供（403/404）はその枚だけ失敗（fail-closed）。元画像（C2PA つき）と完成画像の両方を base64 で返し、保存は既存の /api/gallery（クライアント）
import { NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { requireAuth } from '@/lib/require-auth';
import { fetchJpFonts } from '@/lib/og-fonts';
import { guardImagePrompt, guardImagePromptWithText } from '@/lib/image-guards';
import { generateGptImage25 } from '@/lib/openai-image';
import { hasOpenAIKey } from '@/lib/openai-research';
import { IMAGE_MODEL_IDS, imageCostActual } from '@/lib/model-pricing';
import {
  VISUAL_IMAGE_DEFAULT_SETTINGS,
  VISUAL_IMAGE_QUALITIES,
  VISUAL_IMAGE_SIZE,
  VISUAL_ORIENTATIONS,
  buildVisualImagePrompt,
  checkPlan,
  planBlockReason,
  visualImageIdempotencyKey,
  type VisualImageSettings,
  type VisualOrientation,
} from '@/lib/visuals';
import { buildOverlayElement, collectVisualText } from '@/lib/visual-templates';
import { readPlanBody } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 300;
/** GPT Image の個別タイムアウト（リトライ 0・maxDuration 300 の内側・R-73） */
const IMAGE_TIMEOUT_MS = 240_000;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

type Done = { originalBase64: string; finalBase64: string; width: number; height: number; model: string; costUsd: number | null; usage: unknown; prompt: string; generatedAt: string };
const recent = new Map<string, { at: number; result: Done | Promise<Done> }>();

function sizeOf(size: string): { width: number; height: number } {
  const m = size.match(/^(\d+)x(\d+)$/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1024, height: 1024 };
}

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  if (!hasOpenAIKey()) return NextResponse.json({ error: 'OPENAI_API_KEY が未設定です（GPT Image 2.5 は使えません。表・図はコードで描けます）', unavailable: true }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const read = readPlanBody(body);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  const { plan, sourceText } = read;
  const s = (body.settings ?? {}) as Record<string, unknown>;
  const settings: VisualImageSettings = {
    orientation: VISUAL_ORIENTATIONS.includes(s.orientation as VisualOrientation) ? (s.orientation as VisualOrientation) : VISUAL_IMAGE_DEFAULT_SETTINGS.orientation,
    quality: VISUAL_IMAGE_QUALITIES.includes(s.quality as 'low') ? (s.quality as 'low' | 'medium' | 'high') : VISUAL_IMAGE_DEFAULT_SETTINGS.quality,
    aiText: s.aiText === true,
    extraPrompt: typeof s.extraPrompt === 'string' ? s.extraPrompt.slice(0, 300) : '',
    model: s.model === 'sunburst' ? 'sunburst' : 'flare',
  };
  const check = checkPlan(plan, sourceText);
  const reason = planBlockReason(check);
  if (reason) return NextResponse.json({ error: reason, check }, { status: 400 });

  // R-69: 定型＋院長の追記 → ガード（後勝ち・サーバで常時連結）。aiText のときだけ文字条項の違う専用ガード（医療部分は同文）
  const prompt = settings.aiText ? guardImagePromptWithText(buildVisualImagePrompt(plan, settings)) : guardImagePrompt(buildVisualImagePrompt(plan, settings));
  const key = `${guard.userId}:${visualImageIdempotencyKey(plan, settings)}`;
  const now = Date.now();
  for (const [k, v] of recent) if (now - v.at > IDEMPOTENCY_TTL_MS) recent.delete(k);
  const hit = recent.get(key);
  if (hit) {
    try {
      const result = await hit.result;
      return NextResponse.json({ ...result, deduplicated: true, prompt });
    } catch {
      recent.delete(key);
    }
  }
  const work = (async (): Promise<Done> => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), IMAGE_TIMEOUT_MS);
    try {
      const size = VISUAL_IMAGE_SIZE[settings.orientation];
      const gen = await generateGptImage25({ model: settings.model, prompt, size, quality: settings.quality, signal: abort.signal });
      if (!gen.ok) throw Object.assign(new Error(gen.message), { unavailable: gen.unavailable });
      const { width, height } = sizeOf(size);
      let finalBase64 = gen.base64;
      if (!settings.aiText) {
        const fonts = await fetchJpFonts(collectVisualText(plan));
        const element = buildOverlayElement(plan, `data:image/png;base64,${gen.base64}`, { width, height });
        const img = new ImageResponse(element as never, { width, height, fonts });
        const buffer = Buffer.from(await img.arrayBuffer());
        if (buffer.length === 0) throw new Error('文字の重ねに失敗しました');
        finalBase64 = buffer.toString('base64');
      }
      return { originalBase64: gen.base64, finalBase64, width, height, model: IMAGE_MODEL_IDS[settings.model], costUsd: imageCostActual(gen.usage), usage: gen.usage, prompt, generatedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
  })();
  recent.set(key, { at: now, result: work });
  try {
    const result = await work;
    recent.set(key, { at: now, result });
    return NextResponse.json({ ...result, deduplicated: false });
  } catch (e) {
    recent.delete(key);
    const unavailable = !!(e as { unavailable?: boolean }).unavailable;
    const aborted = e instanceof Error && e.name === 'AbortError';
    const message = aborted ? `時間切れです（${IMAGE_TIMEOUT_MS / 1000}秒）。画像は保存されていません。もう一度お試しください` : e instanceof Error ? e.message : '生成に失敗しました';
    console.error('[visuals/image]', message);
    return NextResponse.json({ error: message, unavailable }, { status: unavailable ? 400 : 500 });
  }
}
