// 315: 図解 API 共通の入力検証（プラン・元テキスト）。fail-closed
import { VISUAL_LABEL_MAX, VISUAL_MAX_GROUPS, VISUAL_MAX_POINTS, VISUAL_SOURCE_MAX_CHARS, VISUAL_TITLE_MAX, isVisualType, type VisualPlan, normalizeEdgeOff } from '@/lib/visuals';

export function readPlanBody(body: Record<string, unknown>): { ok: true; plan: VisualPlan; sourceText: string } | { ok: false; error: string } {
  const raw = (body.plan ?? {}) as Record<string, unknown>;
  if (!isVisualType(raw.type)) return { ok: false, error: 'plan.type が不正です' };
  const title = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim().slice(0, VISUAL_TITLE_MAX) : '';
  const groups = (Array.isArray(raw.groups) ? raw.groups : [])
    .map((g) => {
      const o = (g ?? {}) as Record<string, unknown>;
      const heading = typeof o.heading === 'string' && o.heading.trim() ? o.heading.replace(/\s+/g, ' ').trim().slice(0, VISUAL_LABEL_MAX) : undefined;
      const points = (Array.isArray(o.points) ? o.points : []).map((p) => (typeof p === 'string' ? p.replace(/\s+/g, ' ').trim().slice(0, VISUAL_LABEL_MAX) : '')).filter(Boolean).slice(0, VISUAL_MAX_POINTS);
      return { heading, points };
    })
    .filter((g) => g.points.length > 0 || g.heading)
    .slice(0, VISUAL_MAX_GROUPS);
  const imagePrompt = typeof raw.imagePrompt === 'string' ? raw.imagePrompt.trim().slice(0, 300) : undefined;
  const sourceText = typeof body.sourceText === 'string' ? body.sourceText.slice(0, VISUAL_SOURCE_MAX_CHARS) : '';
  if (!sourceText.trim()) return { ok: false, error: '元テキストが必要です（プランの語句が実在するかを判定します）' };
  // 322: つながり確認で外した辺（描かない）。形だけ検証して通す
  const edgeOff = normalizeEdgeOff(raw.edgeOff);
  // 325: グラフの単位（任意）
  const unit = typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim().slice(0, 20) : undefined;
  const plan: VisualPlan = { id: typeof raw.id === 'string' ? raw.id.slice(0, 40) : 'v', type: raw.type, title, groups, ...(imagePrompt ? { imagePrompt } : {}), ...(edgeOff ? { edgeOff } : {}), ...(unit ? { unit } : {}) };
  return { ok: true, plan, sourceText };
}
