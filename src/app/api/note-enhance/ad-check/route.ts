import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { checkMedicalAd } from '@/lib/medical-ad-check';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 228: 生成済みテキストの医療広告チェック単体API。
// 経路B（/api/note-article はSSEストリームで ad_check を同梱できない）が生成完了後に呼ぶ。
// checkMedicalAd は失敗時に安全側 ok フォールスルー（medical-ad-check.ts の既存挙動）。

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json().catch(() => ({}))) as { content?: unknown };
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return NextResponse.json({ error: '本文が必要です' }, { status: 400 });
    const adCheck = await checkMedicalAd(content);
    return NextResponse.json({ ad_check: adCheck });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[note-enhance/ad-check] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
