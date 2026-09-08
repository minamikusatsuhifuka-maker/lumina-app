// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 302: 🔲 マンダラ — マス⇄記事・エピソードのリンク（mandala_cell_links）。AI不使用・認証必須（R-31）
//
//   GET    ?cellId=   … そのマスのリンク一覧（scope ごとにリンク先を解決。消えていれば exists=false・R-92）
//   POST   {cellId, items:[{scope,item_key}]} … 複数を1リクエストで付ける（項目ごと独立・R-39。既存は unchanged）
//   DELETE ?id=       … 1本を外す（非破壊: 記事は消えない）
// scope の許容値は lib/mandala-shared.ts の MANDALA_LINK_SCOPES（サーバ層 addLinks が検証）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { addLinks, listLinksForCellResolved, removeLink } from '@/lib/mandala-server';
import { MANDALA_LINK_BULK_LIMIT, isUuidLike } from '@/lib/mandala-shared';

export const runtime = 'nodejs';

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const cellId = new URL(req.url).searchParams.get('cellId');
  if (!isUuidLike(cellId)) return fail(400, 'cellId が必要です');
  try {
    const links = await listLinksForCellResolved(guard.userId, cellId);
    if (!links) return fail(404, 'マスが見つかりません');
    return NextResponse.json({ links });
  } catch (e: unknown) {
    console.error('[mandala links] 一覧に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'リンクの取得に失敗しました');
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  let body: { cellId?: unknown; items?: unknown };
  try {
    body = (await req.json()) as { cellId?: unknown; items?: unknown };
  } catch {
    return fail(400, 'リクエストの形式が不正です');
  }
  const cellId = body?.cellId;
  if (!isUuidLike(cellId)) return fail(400, 'cellId が必要です');
  const items = Array.isArray(body.items) ? (body.items as { scope: unknown; item_key: unknown }[]) : [];
  if (items.length === 0) return fail(400, 'items が空です');
  if (items.length > MANDALA_LINK_BULK_LIMIT) return fail(400, `一度に付けられるのは${MANDALA_LINK_BULK_LIMIT}件までです（${items.length}件）`);
  try {
    const result = await addLinks(guard.userId, cellId, items);
    if (!result) return fail(404, 'マスが見つかりません');
    // 保存後の表示は保存された行から（R-95）: 解決済みの一覧を返す
    const links = (await listLinksForCellResolved(guard.userId, cellId)) ?? [];
    return NextResponse.json({ success: true, ...result, links });
  } catch (e: unknown) {
    console.error('[mandala links] 追加に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'リンクの追加に失敗しました');
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return fail(400, 'id が必要です');
  try {
    const ok = await removeLink(guard.userId, id);
    if (!ok) return fail(404, 'リンクが見つかりません');
    return NextResponse.json({ success: true, id });
  } catch (e: unknown) {
    console.error('[mandala links] 削除に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'リンクの削除に失敗しました');
  }
}
