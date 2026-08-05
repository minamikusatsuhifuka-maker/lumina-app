import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  fetchKindleMaterials,
  validateKindleMaterialLimits,
  MAX_KINDLE_SOURCES,
  MAX_KINDLE_TOTAL_CHARS,
} from '@/lib/kindle-materials';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ウィザード①素材選択の検証用。選択IDのメタ（タイトル・文字数）と上限判定を返す。
// 本文は返さない（一覧本文非返却方針）。AI不使用。
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  let ids: unknown;
  try {
    ({ ids } = await req.json());
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.some((v) => typeof v !== 'string')) {
    return NextResponse.json({ error: 'ids（文字列配列）が必要です' }, { status: 400 });
  }

  try {
    const materials = await fetchKindleMaterials(userId, ids as string[]);
    const check = validateKindleMaterialLimits(materials);
    return NextResponse.json({
      materials: materials.map((m) => ({
        id: m.id,
        title: m.title,
        charCount: m.charCount,
        createdAt: m.createdAt,
      })),
      totalChars: check.totalChars,
      ok: check.ok,
      error: check.error ?? null,
      // 選択IDのうち取得できなかった件数（他ユーザー/他type/削除済み）
      missingCount: (ids as string[]).length - materials.length,
      limits: { maxSources: MAX_KINDLE_SOURCES, maxTotalChars: MAX_KINDLE_TOTAL_CHARS },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `素材の確認に失敗しました: ${msg}` }, { status: 500 });
  }
}
