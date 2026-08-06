import { NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { requireAuth } from '@/lib/require-auth';
import { fetchJpFonts } from '@/lib/og-fonts';
import {
  buildSummaryImageElement,
  collectSummaryImageText,
  estimateSummaryImageHeight,
  SUMMARY_IMAGE_WIDTH,
  SUMMARY_IMAGE_TEMPLATES,
  type SummaryImageData,
  type SummaryImageTemplateKey,
} from '@/lib/summary-image-templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 228: noteまとめビジュアル画像（227C方式b=プログラム描画の横展開）。
// 文字は渡されたまとめデータをそのまま描画＝100%正確（AIの創作・再要約なし）。
// Blob保存はここでは行わず base64 を返す→クライアントが既存の /api/gallery 経路で保存する
// （画像の保存経路を増やさない・165の設計を踏襲）。fail-closed: 失敗はエラー返却のみ。

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
      points?: unknown;
      template?: unknown;
    };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const points = (Array.isArray(body.points) ? body.points : [])
      .map((p) => String(p).trim())
      .filter(Boolean)
      .slice(0, 8);
    if (!title || points.length === 0) {
      return NextResponse.json({ error: 'タイトルとまとめ（1点以上）が必要です' }, { status: 400 });
    }
    const template: SummaryImageTemplateKey =
      typeof body.template === 'string' && body.template in SUMMARY_IMAGE_TEMPLATES
        ? (body.template as SummaryImageTemplateKey)
        : 'card';

    const data: SummaryImageData = { title, groups: [{ points }] };
    const fonts = await fetchJpFonts(collectSummaryImageText(data));
    const height = estimateSummaryImageHeight(template, data);
    const img = new ImageResponse(buildSummaryImageElement(template, data) as any, {
      width: SUMMARY_IMAGE_WIDTH,
      height,
      fonts,
    });
    const buffer = Buffer.from(await img.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: '画像の描画に失敗しました' }, { status: 500 });
    }
    return NextResponse.json({
      imageBase64: buffer.toString('base64'),
      width: SUMMARY_IMAGE_WIDTH,
      height,
      template,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[note-enhance/summary-image] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
