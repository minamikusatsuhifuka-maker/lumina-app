// 309: 🔲 マンダラ → 📝 note記事 のプレビュー（変換の結果を返すだけ・DB には書かない・AI 不使用・認証必須）
// GET /api/mandala/[id]/note?mode=free_cell&cell=<cellId> ／ ?mode=paid_chart
// 変換は lib/mandala-note.ts の純関数（R-74）。生成側（/api/dr-hub/persona の mandala オプトイン）も**同じ関数**で材料を作る

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { getChart, listLinksForChartResolved, fetchMandalaLinkBodies } from '@/lib/mandala-server';
import { isUuidLike, mandalaOutlineNested, type MandalaLinkResolved } from '@/lib/mandala-shared';
import { canMakePaidNote, isMandalaNoteMode, mandalaNoteFree, mandalaNotePaid, mandalaNoteToSource, MANDALA_NOTE_PAID_DISABLED_REASON } from '@/lib/mandala-note';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuidLike(id)) return NextResponse.json({ error: 'id が不正です' }, { status: 400 });
  const sp = new URL(req.url).searchParams;
  const mode = sp.get('mode');
  const cellId = sp.get('cell');
  if (!isMandalaNoteMode(mode)) return NextResponse.json({ error: 'mode は free_cell / paid_chart のいずれかです' }, { status: 400 });
  if (mode === 'free_cell' && !isUuidLike(cellId)) return NextResponse.json({ error: 'cell が必要です' }, { status: 400 });
  try {
    const chart = await getChart(guard.userId, id);
    if (!chart) return NextResponse.json({ error: 'マンダラが見つかりません' }, { status: 404 });
    if (mode === 'paid_chart' && !canMakePaidNote(chart.meta, chart.cells)) {
      return NextResponse.json({ error: MANDALA_NOTE_PAID_DISABLED_REASON }, { status: 400 });
    }
    let links: MandalaLinkResolved[] = [];
    try {
      links = await listLinksForChartResolved(guard.userId, id);
    } catch (e: unknown) {
      console.error('[mandala note] リンクの解決に失敗（リンクなしで続行）:', e instanceof Error ? e.message : 'unknown');
    }
    const bodies = await fetchMandalaLinkBodies(guard.userId, links);
    const nested = mandalaOutlineNested(chart.cells);
    const result = mode === 'free_cell' ? mandalaNoteFree(chart, cellId!, nested, links, { bodies }) : mandalaNotePaid(chart, nested, links, { bodies });
    // プレビューには素材の本文を載せない（画面は骨子と件数だけ描く。本文は生成側で同じ関数が組む）
    const lite = JSON.parse(JSON.stringify(result), (k, v) => (k === 'body' && typeof v === 'string' ? '' : v));
    const sourceText = mandalaNoteToSource(result);
    return NextResponse.json({ chartId: chart.id, result: lite, sourceChars: sourceText?.content.length ?? 0, paidLineBefore: sourceText?.paidLineBefore ?? null });
  } catch (e: unknown) {
    console.error('[mandala note] プレビューに失敗:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'note記事のプレビューに失敗しました' }, { status: 500 });
  }
}
