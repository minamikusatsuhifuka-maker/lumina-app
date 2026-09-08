// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラチャート — マス単位の保存（§4-4）。AI不使用・認証必須（R-31）
//
// - 空のマスは正常状態。R-95 の「空本文を拒否」は適用しない（空で保存＝マスを空に戻す操作）
// - 存在しない／他人の cell_id は 404（偽の成功を返さない）
// - 応答は**保存された行**そのもの（画面はこの行から保存成功の表示を作る・R-95）
// - 同一内容の再送はサーバ層が書かずに現在行を返す（unchanged: true・R-87 の最後の砦）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { saveCell } from '@/lib/mandala-server';
import { isUuidLike } from '@/lib/mandala-shared';

export const runtime = 'nodejs';

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'リクエストの形式が不正です');
  }
  const cellId = body?.cellId;
  if (!isUuidLike(cellId)) return fail(400, 'cellId が必要です');
  if (body.title !== undefined && typeof body.title !== 'string') return fail(400, 'title は文字列で送ってください');
  if (body.body !== undefined && typeof body.body !== 'string') return fail(400, 'body は文字列で送ってください');

  try {
    const result = await saveCell(guard.userId, cellId, { title: body.title, body: body.body });
    if (!result.ok) return fail(404, 'マスが見つかりません');
    return NextResponse.json({ success: true, cell: result.cell, unchanged: result.unchanged });
  } catch (e: unknown) {
    console.error('[mandala] マスの保存に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'マスの保存に失敗しました');
  }
}
