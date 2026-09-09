// 315: 🖼 図解生成の補助 GET。mode=status（使えるモデル＝キーの有無だけ）／source（元テキスト）／counts（「🖼 n」）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { hasOpenAIKey } from '@/lib/openai-research';
import { hasBlobCredentials } from '@/lib/blob-auth';
import { countVisualsBySources, fetchVisualSources } from '@/lib/visuals-server';
import { VISUAL_SOURCE_MAX_ITEMS, isVisualSourceScope, joinVisualSources } from '@/lib/visuals';
import { IMAGE_MODEL_IDS, IMAGE_PRICING_CHECKED_ON } from '@/lib/model-pricing';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const sp = req.nextUrl.searchParams;
  const mode = sp.get('mode') ?? 'status';
  if (mode === 'status') {
    return NextResponse.json({ gptImage: hasOpenAIKey(), blob: hasBlobCredentials(), models: IMAGE_MODEL_IDS, checkedOn: IMAGE_PRICING_CHECKED_ON });
  }
  const scope = sp.get('scope') ?? '';
  const ids = (sp.get('ids') ?? sp.get('id') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!isVisualSourceScope(scope)) return NextResponse.json({ error: 'scope は library・text_analysis・context のいずれかを指定してください' }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ error: 'id を指定してください' }, { status: 400 });
  try {
    if (mode === 'counts') {
      const counts = await countVisualsBySources(guard.userId, scope, ids);
      return NextResponse.json({ counts });
    }
    if (mode === 'source') {
      if (ids.length > VISUAL_SOURCE_MAX_ITEMS) return NextResponse.json({ error: `まとめて図解にできるのは${VISUAL_SOURCE_MAX_ITEMS}件までです（${ids.length}件）` }, { status: 400 });
      const rows = await fetchVisualSources(guard.userId, scope, ids);
      if (rows.length === 0) return NextResponse.json({ error: '元テキストが見つかりません' }, { status: 404 });
      const sources = rows.map(({ scope: s, id, title }) => ({ scope: s, id, title }));
      return NextResponse.json({ sources, text: joinVisualSources(sources, rows.map((r) => r.text)), missing: ids.filter((id) => !rows.some((r) => r.id === id)) });
    }
    return NextResponse.json({ error: 'mode が不正です' }, { status: 400 });
  } catch (e) {
    console.error('[visuals GET]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}
