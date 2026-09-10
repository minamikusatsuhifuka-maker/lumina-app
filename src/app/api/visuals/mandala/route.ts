// 324 §3-2(2): 9マスシートのプランを**そのまま**マンダラのチャートにする（AI なし・決定的）。
// 301 の作成（createChart・9マスの空チャート）→ 文字列を書く（writePlanCells・origin なし）→ meta.origin='visual_plan'＋出どころ（R-113 キー単位）。
// 316（記事→マンダラ生成・AI）とは別経路で、316 は不変（R-88）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { GRID9_MIN_CELLS, isVisualSourceScope, planToMandalaCells, typeMinRequirement } from '@/lib/visuals';
import { MANDALA_CENTER, MANDALA_ORIGIN_VISUAL_PLAN } from '@/lib/mandala-shared';
import { createChart, deleteChart, updateChartMeta, writePlanCells } from '@/lib/mandala-server';
import { readPlanBody } from '../_shared';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const read = readPlanBody({ ...body, sourceText: typeof body.sourceText === 'string' && body.sourceText.trim() ? body.sourceText : '（図解プラン）' });
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  const { plan } = read;
  if (plan.type !== 'grid9' && plan.type !== 'grid9_talk') return NextResponse.json({ error: '9マスシート／プレゼン構成のプランだけをマンダラにできます' }, { status: 400 });
  const req1 = typeMinRequirement(plan);
  if (req1) return NextResponse.json({ error: req1 }, { status: 400 });
  const conv = planToMandalaCells(plan);
  if (conv.cells.length < GRID9_MIN_CELLS) return NextResponse.json({ error: `9マスシートはカテゴリ（マス）が${GRID9_MIN_CELLS}つ以上必要です` }, { status: 400 });
  // 出どころ（保存済みなら scope/item_key・未保存はタイトルだけ）
  const src = (body.source ?? null) as Record<string, unknown> | null;
  const source = src && typeof src.scope === 'string' && isVisualSourceScope(src.scope) && (typeof src.item_key === 'string' || typeof src.id === 'string')
    ? { scope: src.scope, item_key: String(src.item_key ?? src.id), title: typeof src.title === 'string' ? src.title.slice(0, 120) : '' }
    : src && typeof src.title === 'string' ? { unsaved: true as const, title: src.title.slice(0, 120) } : null;
  const chart = await createChart(guard.userId, null);
  try {
    const byPos = new Map(chart.cells.filter((c) => c.depth === 1).map((c) => [c.position, c]));
    const center = byPos.get(MANDALA_CENTER);
    if (!center) throw new Error('中央マスがありません');
    const rows = [{ id: center.id, title: conv.center.title, body: conv.center.body }];
    for (const c of conv.cells) {
      const cell = byPos.get(c.position);
      if (cell) rows.push({ id: cell.id, title: c.title, body: c.body });
    }
    const written = await writePlanCells(guard.userId, rows);
    await updateChartMeta(guard.userId, chart.id, { origin: MANDALA_ORIGIN_VISUAL_PLAN, visualPlan: { title: plan.title, at: new Date().toISOString(), source } });
    return NextResponse.json({ chartId: chart.id, written, cells: conv.cells.length });
  } catch (e) {
    // 途中で失敗したら空のチャートを残さない（fail-closed）
    await deleteChart(guard.userId, chart.id).catch(() => {});
    console.error('[visuals/mandala]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'マンダラの作成に失敗しました' }, { status: 500 });
  }
}
