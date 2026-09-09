// 319: 🔭 追加リサーチの補助 GET。mode=sources（ダイアログ用の前提資料のメタ＝タイトル・字数・冒頭。本文は返さない）／
// counts（「🔭 追加: n」）／list（元資料1件から作った追加リサーチの一覧＝ポップアップ）。実行と保存は既存の
// /api/deepresearch（followUp オプトイン）と /api/library（metadata.followUp のフック）が担う（R-88／R-115）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { FOLLOWUP_MAX_SOURCES, FOLLOWUP_PREVIEW_CHARS, followUpTooManyReason, isFollowUpScope, parseFollowUpRefs } from '@/lib/followup-research';
import { countFollowUpsBySources, fetchFollowUpSources, listFollowUpsOf } from '@/lib/followup-research-server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const sp = req.nextUrl.searchParams;
  const mode = sp.get('mode') ?? 'sources';
  try {
    if (mode === 'sources') {
      // scope:id をカンマ区切りで（複数 scope が混ざる選択バーに対応）。旧来の scope=&ids= も受ける
      const raw = (sp.get('refs') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      let refsInput: { scope: string; id: string }[] = raw.map((r) => {
        const i = r.indexOf(':');
        return i > 0 ? { scope: r.slice(0, i), id: r.slice(i + 1) } : { scope: '', id: '' };
      });
      if (refsInput.length === 0) {
        const scope = sp.get('scope') ?? '';
        refsInput = (sp.get('ids') ?? sp.get('id') ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((id) => ({ scope, id }));
      }
      const refs = parseFollowUpRefs(refsInput);
      if (!refs) return NextResponse.json({ error: '前提資料の参照が不正です（scope は library・text_analysis）' }, { status: 400 });
      if (refs.length > FOLLOWUP_MAX_SOURCES) return NextResponse.json({ error: followUpTooManyReason(refs.length) }, { status: 400 });
      const { sources, missing } = await fetchFollowUpSources(guard.userId, refs);
      return NextResponse.json({
        sources: sources.map((s) => ({ scope: s.scope, id: s.id, title: s.title, chars: s.text.length, preview: Array.from(s.text.trim()).slice(0, FOLLOWUP_PREVIEW_CHARS).join('') })),
        missing,
      });
    }
    const scope = sp.get('scope') ?? '';
    if (!isFollowUpScope(scope)) return NextResponse.json({ error: 'scope は library・text_analysis のいずれかを指定してください' }, { status: 400 });
    const ids = (sp.get('ids') ?? sp.get('id') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ error: 'id を指定してください' }, { status: 400 });
    if (mode === 'counts') {
      const counts = await countFollowUpsBySources(guard.userId, scope, ids);
      return NextResponse.json({ counts });
    }
    if (mode === 'list') {
      const items = await listFollowUpsOf(guard.userId, scope, ids[0]);
      return NextResponse.json({ items });
    }
    return NextResponse.json({ error: 'mode が不正です' }, { status: 400 });
  } catch (e) {
    console.error('[followup-research GET]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}
