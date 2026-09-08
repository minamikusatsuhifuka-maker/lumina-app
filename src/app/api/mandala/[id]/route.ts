// 301: 🔲 マンダラチャート — チャート単位の取得（全マス本文を含む・§4-3⑥）。AI不使用・認証必須（R-31）
// 305: POST {action:'expand', parentCellId} — 第2階層（子8マス）の作成。新ルートは作らず既存ルートにアクションを足す
// 307: GET の応答に books（このチャートから起こした Kindle 案件・本の側の記録から導出）を添える。付加情報＝失敗しても本体は返す

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { expandCell, getChart, listBooksFromChart, listLinksForChart, type MandalaBookRef } from '@/lib/mandala-server';
import { isUuidLike, type MandalaLinkLite } from '@/lib/mandala-shared';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuidLike(id)) return NextResponse.json({ error: 'id が不正です' }, { status: 400 });
  try {
    const chart = await getChart(guard.userId, id);
    if (!chart) return NextResponse.json({ error: 'マンダラが見つかりません' }, { status: 404 });
    // 302: リンクは軽い形（id/cell_id/scope/item_key）だけ添える。付加情報なので失敗しても本体は返す（R-39）
    let links: MandalaLinkLite[] = [];
    try {
      links = await listLinksForChart(guard.userId, id);
    } catch (e: unknown) {
      console.error('[mandala] リンク一覧の取得に失敗（本体は返す）:', e instanceof Error ? e.message : 'unknown');
    }
    let books: MandalaBookRef[] = [];
    try {
      books = await listBooksFromChart(guard.userId, id);
    } catch (e: unknown) {
      console.error('[mandala] 起こした本の取得に失敗（本体は返す）:', e instanceof Error ? e.message : 'unknown');
    }
    return NextResponse.json({ chart, links, books });
  } catch (e: unknown) {
    console.error('[mandala] 取得に失敗:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'マンダラの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuidLike(id)) return NextResponse.json({ error: 'id が不正です' }, { status: 400 });
  let body: { action?: unknown; parentCellId?: unknown };
  try {
    body = (await req.json()) as { action?: unknown; parentCellId?: unknown };
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  }
  if (body?.action !== 'expand') return NextResponse.json({ error: 'action が不正です' }, { status: 400 });
  if (!isUuidLike(body.parentCellId)) return NextResponse.json({ error: 'parentCellId が必要です' }, { status: 400 });
  try {
    const result = await expandCell(guard.userId, id, body.parentCellId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason === 'not_found' ? 'マスが見つかりません' : '第1階層のマスだけを展開できます' },
        { status: result.reason === 'not_found' ? 404 : 400 },
      );
    }
    return NextResponse.json({ success: true, created: result.created, children: result.children });
  } catch (e: unknown) {
    console.error('[mandala] 展開に失敗:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: '子マスの作成に失敗しました' }, { status: 500 });
  }
}
