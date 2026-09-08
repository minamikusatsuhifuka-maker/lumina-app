// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラチャート — 一覧（本文なし・§4-3⑥）／作成（9マス同時・§4-2）／削除（CASCADE）。AI不使用
//
// - 認証必須（R-31）。所有者検証はすべて user_id で絞る（他人のチャートは 404）
// - 一覧は本文を含めない（299 §3-1「一覧が本文を返さず中身が空」を繰り返さない＝本文はチャート単位 API）
// - 作成はサーバ層の CTE 1文（マス作成に失敗したらチャートも作らない・fail-closed）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { createChart, deleteChart, listCharts } from '@/lib/mandala-server';
import { isUuidLike } from '@/lib/mandala-shared';

export const runtime = 'nodejs';

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  try {
    const items = await listCharts(guard.userId);
    return NextResponse.json({ items, total: items.length });
  } catch (e: unknown) {
    console.error('[mandala] 一覧の取得に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'マンダラの一覧取得に失敗しました');
  }
}

export async function POST() {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  try {
    const chart = await createChart(guard.userId);
    return NextResponse.json({ success: true, id: chart.id, chart });
  } catch (e: unknown) {
    console.error('[mandala] 作成に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'マンダラの作成に失敗しました');
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!isUuidLike(id)) return fail(400, 'id が必要です');
  try {
    const result = await deleteChart(guard.userId, id);
    if (!result) return fail(404, 'マンダラが見つかりません');
    return NextResponse.json({ success: true, id, deleted: result });
  } catch (e: unknown) {
    console.error('[mandala] 削除に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'マンダラの削除に失敗しました');
  }
}
