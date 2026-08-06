import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithProvider, IMAGE_MODELS, type ImageModelKey } from '@/lib/image-providers';
import { IMAGE_GUARD_SUFFIX } from '@/lib/image-guards';
import { getKindleImageStyle } from '@/lib/kindle-image-styles';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 228: note挿絵の生成（226のエンジン枠組みの横展開）。
// - エンジン3種・画風4種（画風プリセットは kindle-image-styles.ts の定義を共用＝内容は媒体非依存）
// - 生成時ガード IMAGE_GUARD_SUFFIX をサーバ側で必ず連結（編集で消されても効かせる＝226方式）
// - Blob保存はここでは行わず base64 を返す→クライアントが既存の /api/gallery 経路で保存する
// - note挿絵は正方形固定（記事本文・挿絵の既定比率＝185の用途ラベルと同じ）

const VALID_ENGINES = new Set<string>(IMAGE_MODELS.map((m) => m.key));

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      prompt?: unknown;
      engine?: unknown;
      styleKey?: unknown;
    };
    const engine = String(body.engine || '');
    if (!VALID_ENGINES.has(engine)) {
      return NextResponse.json({ error: `engineが不正です（対応: ${[...VALID_ENGINES].join('/')}）` }, { status: 400 });
    }
    const userPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!userPrompt) return NextResponse.json({ error: 'プロンプトが空です' }, { status: 400 });
    const style = getKindleImageStyle(body.styleKey);

    const finalPrompt = `${userPrompt}\n\n${style.promptBlock}\n${IMAGE_GUARD_SUFFIX}`;
    const result = await generateWithProvider(engine as ImageModelKey, {
      prompt: finalPrompt,
      aspect: 'square',
      quality: 'high',
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      imageBase64: result.base64,
      mimeType: result.mimeType,
      sizeLabel: result.sizeLabel,
      elapsedMs: result.elapsedMs,
      engine,
      styleKey: style.key,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[note-enhance/image] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
