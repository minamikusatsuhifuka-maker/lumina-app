// 307: 🔲 マンダラ → 📕 Kindle目次 のプレビュー（変換の結果を返すだけ・DB には書かない・AI 不使用・認証必須）
//
// 変換は lib/mandala-kindle.ts の純関数 1本（R-74）。ここでは材料（全マス・解決済みリンク・素材の適合）を揃えて渡す。
// 素材の適合（実在・所有者・library の type）は fetchKindleMaterials（ウィザードの素材取得と同じ経路・R-91）で判定し、
// 適合しないリンクは「参照のみ」として純関数へ渡す（materialKeyOf）。
// 保存（起こす）はウィザードの既存の確定経路（/api/kindle/wizard/create）＝このプレビューの chapters をそのまま渡す。

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { getChart, listLinksForChartResolved } from '@/lib/mandala-server';
import { centerCell, isUuidLike, mandalaOutlineNested, type MandalaLinkResolved } from '@/lib/mandala-shared';
import { defaultMaterialKeyOf, mandalaToKindleOutline } from '@/lib/mandala-kindle';
import { fetchKindleMaterials, type KindleMaterialRow } from '@/lib/kindle-materials';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuidLike(id)) return NextResponse.json({ error: 'id が不正です' }, { status: 400 });
  const includeEmpty = new URL(req.url).searchParams.get('includeEmpty') === '1';
  try {
    const chart = await getChart(guard.userId, id);
    if (!chart) return NextResponse.json({ error: 'マンダラが見つかりません' }, { status: 404 });
    let links: MandalaLinkResolved[] = [];
    try {
      links = await listLinksForChartResolved(guard.userId, id);
    } catch (e: unknown) {
      console.error('[mandala kindle] リンクの解決に失敗（リンクなしで続行）:', e instanceof Error ? e.message : 'unknown');
    }

    // 素材の適合: scope から素材キー候補を作り、ウィザードと同じ取得経路で実在・type を確かめる
    const candidates = new Map<string, string>(); // materialKey → 元のリンク鍵
    for (const l of links) {
      if (!l.exists) continue;
      const key = defaultMaterialKeyOf(l);
      if (key) candidates.set(key, `${l.scope}:${l.item_key}`);
    }
    let materials: KindleMaterialRow[] = [];
    if (candidates.size > 0) {
      try {
        materials = await fetchKindleMaterials(guard.userId, [...candidates.keys()]);
      } catch (e: unknown) {
        console.error('[mandala kindle] 素材の適合判定に失敗（すべて参照のみ）:', e instanceof Error ? e.message : 'unknown');
        materials = [];
      }
    }
    const eligible = new Map(materials.map((m) => [m.id, m]));
    const result = mandalaToKindleOutline(centerCell(chart.cells), mandalaOutlineNested(chart.cells), links, {
      includeEmpty,
      materialKeyOf: (l) => {
        const key = defaultMaterialKeyOf(l);
        return key && eligible.has(key) ? key : null;
      },
    });
    // 素材の行（①の一覧に混載する形＝タイトル・字数・種別）。本文は返さない
    const materialRows = result.ok
      ? result.sourceIds
          .map((k) => eligible.get(k))
          .filter((m): m is KindleMaterialRow => !!m)
          .map((m) => ({ id: m.id, title: m.title, char_count: m.charCount, created_at: m.createdAt, source: m.source }))
      : [];
    return NextResponse.json({ chartId: chart.id, updated_at: chart.updated_at, includeEmpty, result, materials: materialRows });
  } catch (e: unknown) {
    console.error('[mandala kindle] プレビューに失敗:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'Kindle目次のプレビューに失敗しました' }, { status: 500 });
  }
}
