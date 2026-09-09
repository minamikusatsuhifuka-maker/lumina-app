// 315: 🖼 図解生成のサーバ専用（DB）。元テキストの取得（scope＋id）と「🖼 n」の集計（image_gallery.settings.visual.sourceKeys から導出）
import { sql } from '@/lib/db';
import { VISUAL_SOURCE_MAX_ITEMS, isVisualSourceScope, visualSourceKey, type VisualSourceRef } from '@/lib/visuals';

export interface VisualSourceRow extends VisualSourceRef {
  text: string;
}

/** 元テキスト（本人のものだけ・最大3件・存在しない id は落とす） */
export async function fetchVisualSources(userId: string, scope: string, ids: readonly string[]): Promise<VisualSourceRow[]> {
  if (!isVisualSourceScope(scope)) return [];
  const keys = [...new Set(ids.map(String).filter(Boolean))].slice(0, VISUAL_SOURCE_MAX_ITEMS);
  if (keys.length === 0) return [];
  let rows: { k: string; title: string | null; text: string | null }[] = [];
  if (scope === 'library') {
    rows = (await sql`SELECT id::text AS k, title, content AS text FROM library WHERE user_id = ${userId} AND id::text = ANY(${keys})`) as typeof rows;
  } else if (scope === 'text_analysis') {
    rows = (await sql`SELECT id::text AS k, COALESCE(NULLIF(auto_title, ''), file_name) AS title, content AS text FROM text_analysis_saves WHERE user_id = ${userId} AND id::text = ANY(${keys})`) as typeof rows;
  } else {
    rows = (await sql`SELECT id::text AS k, topic AS title, context_text AS text FROM context_saves WHERE user_id = ${userId} AND id::text = ANY(${keys})`) as typeof rows;
  }
  const byKey = new Map(rows.map((r) => [r.k, r]));
  return keys
    .map((k) => byKey.get(k))
    .filter((r): r is { k: string; title: string | null; text: string | null } => !!r)
    .map((r) => ({ scope, id: r.k, title: (r.title ?? '').trim() || '（無題）', text: r.text ?? '' }));
}

/** 元テキストごとの図解の件数（完成画像だけ数える＝元画像（AI）は含めない） */
export async function countVisualsBySources(userId: string, scope: string, ids: readonly string[]): Promise<Record<string, number>> {
  const keys = [...new Set(ids.map(String).filter(Boolean))].slice(0, 500).map((id) => visualSourceKey(scope, id));
  const out: Record<string, number> = {};
  if (keys.length === 0) return out;
  const rows = (await sql`
    SELECT k, COUNT(*)::int AS n
    FROM image_gallery g, jsonb_array_elements_text(g.settings->'visual'->'sourceKeys') AS k
    WHERE g.owner = ${userId} AND g.source = 'visuals' AND (g.settings->'visual'->>'kind') <> 'image-original' AND k = ANY(${keys})
    GROUP BY k
  `) as { k: string; n: number }[];
  for (const r of rows) out[r.k.slice(scope.length + 1)] = Number(r.n);
  return out;
}
