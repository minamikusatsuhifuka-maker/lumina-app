// 312: 🔲 マンダラ → 🐦 X投稿 のプレビュー（変換の結果を返すだけ・DB には書かない・AI 不使用・認証必須）
// GET /api/mandala/[id]/x?mode=cell&cell=<cellId>&count=3 ／ ?mode=series
// 変換は lib/mandala-x.ts の純関数（R-74）。生成側（/api/dr-hub/x-post の mandala オプトイン）も同じ関数で材料を組む

import { NextRequest, NextResponse } from 'next/server';
import { hasAiOrigin } from '@/lib/mandala-generate';
import { requireAuth } from '@/lib/require-auth';
import { getChart, listLinksForChartResolved, fetchMandalaLinkBodies } from '@/lib/mandala-server';
import { isUuidLike, mandalaOutlineNested, type MandalaLinkResolved } from '@/lib/mandala-shared';
import { isMandalaXMode, mandalaXCell, mandalaXSeries, mandalaXToArticle } from '@/lib/mandala-x';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuidLike(id)) return NextResponse.json({ error: 'id が不正です' }, { status: 400 });
  const sp = new URL(req.url).searchParams;
  const mode = sp.get('mode');
  const cellId = sp.get('cell');
  if (!isMandalaXMode(mode)) return NextResponse.json({ error: 'mode は cell / series のいずれかです' }, { status: 400 });
  if (mode === 'cell' && !isUuidLike(cellId)) return NextResponse.json({ error: 'cell が必要です' }, { status: 400 });
  try {
    const chart = await getChart(guard.userId, id);
    if (!chart) return NextResponse.json({ error: 'マンダラが見つかりません' }, { status: 404 });
    let links: MandalaLinkResolved[] = [];
    try {
      links = await listLinksForChartResolved(guard.userId, id);
    } catch (e: unknown) {
      console.error('[mandala x] リンクの解決に失敗（リンクなしで続行）:', e instanceof Error ? e.message : 'unknown');
    }
    const bodies = await fetchMandalaLinkBodies(guard.userId, links);
    const result = mode === 'cell' ? mandalaXCell(chart, cellId!, links, { bodies, count: sp.get('count') }) : mandalaXSeries(chart, mandalaOutlineNested(chart.cells), links, { bodies });
    const lite = JSON.parse(JSON.stringify(result), (k, v) => (k === 'body' && typeof v === 'string' ? '' : v));
    const sourceChars = result.ok ? (result.mode === 'cell' ? mandalaXToArticle(result)?.content.length ?? 0 : result.posts.reduce((s, _p, i) => s + (mandalaXToArticle(result, i)?.content.length ?? 0), 0)) : 0;
    // 316 §3-5: origin='ai' のマスを含むとき「体験ではありません」の1文を画面に出す
    const included = mode === 'cell' ? chart.cells.filter((c) => c.id === cellId) : chart.cells.filter((c) => c.depth === 1);
    return NextResponse.json({ chartId: chart.id, result: lite, sourceChars, aiOrigin: hasAiOrigin(included) });
  } catch (e: unknown) {
    console.error('[mandala x] プレビューに失敗:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'X投稿のプレビューに失敗しました' }, { status: 500 });
  }
}
