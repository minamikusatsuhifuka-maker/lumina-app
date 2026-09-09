// 316 §3-3: 記事→マンダラ生成 第1段階（中央＋要点8）。Gemini → 検証（純関数）→ 301 の作成 → 9マス書き込み → 302 で中央に元記事をリンク。
// - 二重発火: 同じ記事から同時に2枚作らない（インスタンス内の進行中キー・R-87）
// - 再生成（chartId あり）: edited のマスが1つでもあれば 400（R-76）。無ければ子・リンクを消して作り直す
// - fixture（テスト用）: AI を回さず固定 JSON を**同じ検証・作成経路**に通す（本人の記事にしか使えない）
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_MODEL, GEMINI_TEXT_THINKING_LOW } from '@/lib/ai-models';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { fetchVisualSources } from '@/lib/visuals-server';
import { isVisualSourceScope } from '@/lib/visuals';
import { addLinks, createChart, deleteChart, findRecentGeneration, getChart, resetGeneratedChart, updateChartMeta, writeGeneratedCells } from '@/lib/mandala-server';
import { MANDALA_CENTER, isUuidLike } from '@/lib/mandala-shared';
import {
  GEN_STAGE1_MAX_TOKENS,
  GEN_STAGE_TIMEOUT_MS,
  MANDALA_GENERATE_ARTICLE_MAX_CHARS,
  buildStage1Prompt,
  cellBodyWithEvidence,
  isMandalaGenerateMode,
  regenerateState,
  relationsFromPoints,
  remapRelationIndexes,
  validateStage1,
} from '@/lib/mandala-generate';

export const runtime = 'nodejs';
export const maxDuration = 120;

const running = new Map<string, number>();
const RUNNING_TTL_MS = 3 * 60 * 1000;
/** 同じ記事から 60 秒以内の再生成は二重送信とみなす（DB で判定＝別インスタンスにも効く）。再生成（chartId 指定）はその chart 自身なら通す */
const DEDUPE_WINDOW_MS = 60 * 1000;

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => ({}))) as { scope?: unknown; itemKey?: unknown; mode?: unknown; chartId?: unknown; fixture?: unknown };
  if (!isVisualSourceScope(body.scope)) return NextResponse.json({ error: 'scope は library・text_analysis・context のいずれかです' }, { status: 400 });
  const itemKey = typeof body.itemKey === 'string' || typeof body.itemKey === 'number' ? String(body.itemKey) : '';
  if (!itemKey) return NextResponse.json({ error: 'itemKey が必要です' }, { status: 400 });
  const mode = isMandalaGenerateMode(body.mode) ? body.mode : '9';
  const chartId = typeof body.chartId === 'string' && isUuidLike(body.chartId) ? body.chartId : null;
  const key = `${guard.userId}:${body.scope}:${itemKey}`;
  const now = Date.now();
  for (const [k, t] of running) if (now - t > RUNNING_TTL_MS) running.delete(k);
  if (running.has(key)) return NextResponse.json({ error: '同じ記事からの生成がすでに進行中です（二重送信）' }, { status: 409 });
  running.set(key, now);
  let createdChartId: string | null = null;
  try {
    // R-87 サーバ側（DB）: 進行中／直近 60 秒以内に同じ記事から生成したチャートがあれば 409（再生成は自分の chart なら通す）
    const recent = await findRecentGeneration(guard.userId, key, DEDUPE_WINDOW_MS, now);
    if (recent && recent.chartId !== chartId) {
      return NextResponse.json({ error: recent.state === 'generating' ? '同じ記事からの生成がすでに進行中です（二重送信）' : '同じ記事から直前に生成したマンダラがあります（1分ほど待ってから再度お試しください）', chartId: recent.chartId }, { status: 409 });
    }
    const [src] = await fetchVisualSources(guard.userId, body.scope, [itemKey]);
    if (!src) return NextResponse.json({ error: '元記事が見つかりません' }, { status: 404 });
    const article = src.text.slice(0, MANDALA_GENERATE_ARTICLE_MAX_CHARS);
    if (article.trim().length < 100) return NextResponse.json({ error: '記事本文が短すぎます（100字以上）' }, { status: 400 });
    // 再生成: 取得と検証に成功してから破壊的操作（R-76）
    if (chartId) {
      const chart = await getChart(guard.userId, chartId);
      if (!chart) return NextResponse.json({ error: 'マンダラが見つかりません' }, { status: 404 });
      const st = regenerateState(chart.cells);
      if (!st.enabled) return NextResponse.json({ error: st.reason }, { status: 400 });
    }
    // 進行中の印（DB）。新規はこの時点でチャートを作って印を付ける＝並行する2本目が DB で見える。失敗したら消す
    let chart = chartId ? await getChart(guard.userId, chartId) : null;
    if (!chartId) {
      chart = await createChart(guard.userId);
      createdChartId = chart.id;
    }
    if (!chart) return NextResponse.json({ error: 'マンダラが見つかりません' }, { status: 404 });
    await updateChartMeta(guard.userId, chart.id, { generating: { key, startedAt: new Date(now).toISOString() } });
    // 第1段階: AI（または fixture）→ 検証
    let raw: unknown;
    if (body.fixture !== undefined) {
      raw = body.fixture;
    } else {
      const { system, prompt } = buildStage1Prompt(article);
      const ai = await Promise.race([
        generateWithModel('gemini', prompt, system, GEN_STAGE1_MAX_TOKENS, { responseMimeType: 'application/json', ...GEMINI_TEXT_THINKING_LOW }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`時間切れです（${GEN_STAGE_TIMEOUT_MS / 1000}秒）。もう一度お試しください`)), GEN_STAGE_TIMEOUT_MS)),
      ]);
      try {
        raw = robustJsonParse(ai);
      } catch {
        return NextResponse.json({ error: 'AI の出力を JSON として読めませんでした（もう一度お試しください）' }, { status: 502 });
      }
      raw = remapRelationIndexes(raw);
    }
    const v = validateStage1(raw, article);
    if (!v.ok) return NextResponse.json({ error: v.reason, dropped: v.dropped }, { status: 422 });
    // 再生成: 検証に成功してから子・リンク・第1階層を空に（R-76）
    if (chartId) {
      await resetGeneratedChart(guard.userId, chartId);
      chart = (await getChart(guard.userId, chartId))!;
    }
    const byPos = new Map(chart.cells.filter((c) => c.depth === 1).map((c) => [c.position, c]));
    const center = byPos.get(MANDALA_CENTER)!;
    const rows = [{ id: center.id, title: v.center.title, body: v.center.body }];
    const points: { position: number; cellId: string; title: string }[] = [];
    for (const p of v.points) {
      const cell = byPos.get(p.position);
      if (!cell) continue;
      rows.push({ id: cell.id, title: p.title, body: cellBodyWithEvidence(p.body, p.evidence) });
      points.push({ position: p.position, cellId: cell.id, title: p.title });
    }
    await writeGeneratedCells(guard.userId, rows);
    const generatedAt = new Date().toISOString();
    await updateChartMeta(guard.userId, chart.id, {
      generated: { key, source: { scope: body.scope, item_key: itemKey, title: src.title }, model: body.fixture !== undefined ? 'fixture' : GEMINI_TEXT_MODEL, mode, generatedAt, dropped: { points: v.dropped.points, items: 0 } },
      relations: relationsFromPoints(v.points),
      generating: null,
    });
    createdChartId = null; // 成功＝残す
    // 中央マスに元記事をリンク（302・失敗しても作成は残す・R-39）
    let linked = false;
    try {
      const r = await addLinks(guard.userId, center.id, [{ scope: body.scope, item_key: itemKey }]);
      linked = !!r && (r.added.length > 0 || r.unchanged.length > 0);
    } catch (e) {
      console.warn('[mandala generate] 元記事のリンクに失敗:', e instanceof Error ? e.message : e);
    }
    return NextResponse.json({ chartId: chart.id, mode, points, dropped: v.dropped, linked, generatedAt, regenerated: !!chartId });
  } catch (e) {
    console.error('[mandala generate]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : '生成に失敗しました' }, { status: 500 });
  } finally {
    running.delete(key);
    // 失敗（AI・検証・例外）で残った空のチャートは消す。再生成のときは印だけ消す
    if (createdChartId) await deleteChart(guard.userId, createdChartId).catch(() => {});
    else if (chartId) await updateChartMeta(guard.userId, chartId, { generating: null }).catch(() => {});
  }
}
