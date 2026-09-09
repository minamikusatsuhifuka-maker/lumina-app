// 316 §3-3: 第2段階（要点1つ → 小項目8）。要点ごとに独立（R-39）: 失敗した要点は未展開のまま残す。
// 再生成（既に子がある）: 子に edited が1つでもあれば 400（R-76）。無ければ子を消して作り直す
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_LOW } from '@/lib/ai-models';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { fetchVisualSources } from '@/lib/visuals-server';
import { deleteChildren, expandCell, getChart, updateChartMeta, writeGeneratedCells } from '@/lib/mandala-server';
import { isUuidLike } from '@/lib/mandala-shared';
import {
  EVIDENCE_QUOTE_PREFIX,
  GEN_STAGE2_MAX_TOKENS,
  GEN_STAGE_TIMEOUT_MS,
  MANDALA_GENERATE_ARTICLE_MAX_CHARS,
  buildStage2Prompt,
  cellBodyWithEvidence,
  parseGeneratedMeta,
  regenerateState,
  validateStage2,
} from '@/lib/mandala-generate';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => ({}))) as { chartId?: unknown; cellId?: unknown; fixture?: unknown };
  if (!isUuidLike(body.chartId) || !isUuidLike(body.cellId)) return NextResponse.json({ error: 'chartId と cellId が必要です' }, { status: 400 });
  try {
    const chart = await getChart(guard.userId, body.chartId);
    if (!chart) return NextResponse.json({ error: 'マンダラが見つかりません' }, { status: 404 });
    const gen = parseGeneratedMeta(chart.meta);
    if (!gen) return NextResponse.json({ error: '記事から生成したマンダラではありません' }, { status: 400 });
    const cell = chart.cells.find((c) => c.id === body.cellId && c.depth === 1);
    if (!cell) return NextResponse.json({ error: '要点のマスが見つかりません' }, { status: 404 });
    if (!cell.title.trim()) return NextResponse.json({ error: '空のマスは展開できません' }, { status: 400 });
    const children = chart.cells.filter((c) => c.parent_cell_id === cell.id);
    if (children.length > 0) {
      const st = regenerateState(children);
      if (!st.enabled) return NextResponse.json({ error: st.reason }, { status: 400 });
    }
    const [src] = await fetchVisualSources(guard.userId, gen.source.scope, [gen.source.item_key]);
    if (!src) return NextResponse.json({ error: '元記事が見つかりません（削除された可能性）' }, { status: 404 });
    const article = src.text.slice(0, MANDALA_GENERATE_ARTICLE_MAX_CHARS);
    // 要点の本文から引用行を外して AI に渡す（引用は evidence として別に渡す）
    const bodyLines = cell.body.split('\n');
    const evidenceLine = bodyLines.find((l) => l.startsWith(EVIDENCE_QUOTE_PREFIX)) ?? '';
    const point = { title: cell.title, body: bodyLines.filter((l) => !l.startsWith(EVIDENCE_QUOTE_PREFIX)).join('\n').trim(), evidence: evidenceLine.slice(EVIDENCE_QUOTE_PREFIX.length) };
    let raw: unknown;
    if (body.fixture !== undefined) {
      raw = body.fixture;
    } else {
      const { system, prompt } = buildStage2Prompt(article, point);
      const ai = await Promise.race([
        generateWithModel('gemini', prompt, system, GEN_STAGE2_MAX_TOKENS, { responseMimeType: 'application/json', ...GEMINI_TEXT_THINKING_LOW }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`時間切れです（${GEN_STAGE_TIMEOUT_MS / 1000}秒）`)), GEN_STAGE_TIMEOUT_MS)),
      ]);
      try {
        raw = robustJsonParse(ai);
      } catch {
        return NextResponse.json({ error: 'AI の出力を JSON として読めませんでした', cellId: cell.id }, { status: 502 });
      }
    }
    const v = validateStage2(raw, article);
    if (!v.ok) return NextResponse.json({ error: v.reason, dropped: v.dropped, cellId: cell.id }, { status: 422 });
    // 検証に成功してから破壊的操作（R-76）: 既存の子を消して 305 の展開（8マス一括）
    if (children.length > 0) await deleteChildren(guard.userId, cell.id);
    const exp = await expandCell(guard.userId, chart.id, cell.id);
    if (!exp.ok) return NextResponse.json({ error: '展開に失敗しました', cellId: cell.id }, { status: 500 });
    const byPos = new Map(exp.children.map((c) => [c.position, c]));
    const rows = v.items.map((it) => ({ id: byPos.get(it.position)!.id, title: it.title, body: cellBodyWithEvidence(it.body, it.evidence) })).filter((r) => !!r.id);
    await writeGeneratedCells(guard.userId, rows);
    const droppedItems = gen.dropped.items + v.dropped.items;
    await updateChartMeta(guard.userId, chart.id, { generated: { ...gen, dropped: { points: gen.dropped.points, items: droppedItems } } });
    return NextResponse.json({ cellId: cell.id, created: rows.length, dropped: v.dropped });
  } catch (e) {
    console.error('[mandala generate/point]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : '小項目の生成に失敗しました', cellId: body.cellId }, { status: 500 });
  }
}
