'use client';
// 316: 記事→マンダラ生成の実行（画面側の共通ロジック）。第1段階（作成）→ 81 のときは要点ごとに第2段階を並列（allSettled・R-39）
import { GEN_STAGE2_PARALLEL, type MandalaGenerateMode } from '@/lib/mandala-generate';

export interface GenerateProgress {
  stage: 'stage1' | 'stage2' | 'done' | 'error';
  points: number;
  itemsDone: number;
  itemsTotal: number;
  failed: string[];
  message: string;
}
export interface GenerateOutcome {
  chartId: string;
  mode: MandalaGenerateMode;
  points: { position: number; cellId: string; title: string }[];
  dropped: { points: number; relations: number; items: number; reasons: string[] };
  failedPoints: { cellId: string; title: string; error: string }[];
  createdItems: number;
}

export async function runMandalaGeneration(
  input: { scope: string; itemKey: string; mode: MandalaGenerateMode; chartId?: string; fixture?: unknown; pointFixtures?: Record<string, unknown> },
  onProgress: (p: GenerateProgress) => void,
): Promise<GenerateOutcome> {
  onProgress({ stage: 'stage1', points: 0, itemsDone: 0, itemsTotal: 0, failed: [], message: '要点を抽出中…' });
  const r1 = await fetch('/api/mandala/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: input.scope, itemKey: input.itemKey, mode: input.mode, ...(input.chartId ? { chartId: input.chartId } : {}), ...(input.fixture !== undefined ? { fixture: input.fixture } : {}) }),
  });
  const j1 = (await r1.json().catch(() => ({}))) as { chartId?: string; points?: { position: number; cellId: string; title: string }[]; dropped?: GenerateOutcome['dropped']; error?: string };
  if (!r1.ok || !j1.chartId || !j1.points) throw new Error(j1.error || `生成に失敗しました（${r1.status}）`);
  const outcome: GenerateOutcome = { chartId: j1.chartId, mode: input.mode, points: j1.points, dropped: j1.dropped ?? { points: 0, relations: 0, items: 0, reasons: [] }, failedPoints: [], createdItems: 0 };
  if (input.mode !== '81') {
    onProgress({ stage: 'done', points: j1.points.length, itemsDone: 0, itemsTotal: 0, failed: [], message: `要点 ${j1.points.length}/8 を作成しました` });
    return outcome;
  }
  const total = j1.points.length;
  let done = 0;
  onProgress({ stage: 'stage2', points: total, itemsDone: 0, itemsTotal: total, failed: [], message: `要点 ${total}/8 → 小項目 0/${total} 展開中…` });
  const queue = [...j1.points];
  const workers = Array.from({ length: Math.min(GEN_STAGE2_PARALLEL, queue.length) }, async () => {
    while (queue.length > 0) {
      const p = queue.shift()!;
      try {
        const r2 = await fetch('/api/mandala/generate/point', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chartId: j1.chartId, cellId: p.cellId, ...(input.pointFixtures && p.cellId in input.pointFixtures ? { fixture: input.pointFixtures[p.cellId] } : input.pointFixtures && String(p.position) in input.pointFixtures ? { fixture: input.pointFixtures[String(p.position)] } : {}) }),
        });
        const j2 = (await r2.json().catch(() => ({}))) as { created?: number; error?: string; dropped?: { items: number } };
        if (!r2.ok) throw new Error(j2.error || `HTTP ${r2.status}`);
        outcome.createdItems += j2.created ?? 0;
        outcome.dropped.items += j2.dropped?.items ?? 0;
      } catch (e) {
        outcome.failedPoints.push({ cellId: p.cellId, title: p.title, error: e instanceof Error ? e.message : String(e) });
      } finally {
        done += 1;
        onProgress({ stage: 'stage2', points: total, itemsDone: done, itemsTotal: total, failed: outcome.failedPoints.map((f) => f.title), message: `要点 ${total}/8 → 小項目 ${done}/${total} 展開中…` });
      }
    }
  });
  await Promise.allSettled(workers);
  onProgress({ stage: 'done', points: total, itemsDone: done, itemsTotal: total, failed: outcome.failedPoints.map((f) => f.title), message: outcome.failedPoints.length > 0 ? `小項目 ${done - outcome.failedPoints.length}/${total} を展開（${outcome.failedPoints.length}件は未展開のまま）` : `小項目 ${total}/${total} を展開しました` });
  return outcome;
}
