// 301: 🔲 マンダラチャート — チャート単位の取得（全マス本文を含む・§4-3⑥）。AI不使用・認証必須（R-31）

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { getChart, listLinksForChart } from '@/lib/mandala-server';
import { isUuidLike, type MandalaLinkLite } from '@/lib/mandala-shared';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuidLike(id)) return NextResponse.json({ error: 'id が不正です' }, { status: 400 });
  try {
    const chart = await getChart(guard.userId, id);
    if (!chart) return NextResponse.json({ error: 'マンダラが見つかりません' }, { status: 404 });
    // 302: リンクは軽い形（id/cell_id/scope/item_key）だけ添える。付加情報なので失敗しても本体は返す（R-39）
    let links: MandalaLinkLite[] = [];
    try {
      links = await listLinksForChart(guard.userId, id);
    } catch (e: unknown) {
      console.error('[mandala] リンク一覧の取得に失敗（本体は返す）:', e instanceof Error ? e.message : 'unknown');
    }
    return NextResponse.json({ chart, links });
  } catch (e: unknown) {
    console.error('[mandala] 取得に失敗:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'マンダラの取得に失敗しました' }, { status: 500 });
  }
}
