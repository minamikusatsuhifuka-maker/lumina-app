// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラチャート — マス単位の保存（§4-4）。AI不使用・認証必須（R-31）
//
// - 空のマスは正常状態。R-95 の「空本文を拒否」は適用しない（空で保存＝マスを空に戻す操作）
// - 存在しない／他人の cell_id は 404（偽の成功を返さない）
// - 応答は**保存された行**そのもの（画面はこの行から保存成功の表示を作る・R-95）
// - 同一内容の再送はサーバ層が書かずに現在行を返す（unchanged: true・R-87 の最後の砦）
// 308: 同じルートに meta の部分更新（tier／reaction）を足す（新ルートなし）。meta はキー単位マージ（updateCellMeta）。
//   検証はサーバ側（整数・非負・100字）。不正は 400 で何も書かない（fail-closed）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { saveCell, startResearch, updateCellMeta } from '@/lib/mandala-server';
import { isMandalaResearchKind } from '@/lib/mandala-research';
import { MANDALA_REACTION_KEYS, isMandalaTier, isUuidLike, normalizeReactionInput, normalizeReactionXInput, type MandalaCell } from '@/lib/mandala-shared';

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
  // 308: meta の部分更新。tier は 'free'|'paid'、reaction はオブジェクト（全部空＝キーを消す）か null
  const hasText = body.title !== undefined || body.body !== undefined;
  const hasTier = body.tier !== undefined;
  const hasReaction = body.reaction !== undefined;
  if (hasTier && !isMandalaTier(body.tier)) return fail(400, 'tier は free / paid のいずれかです');
  // 312: reaction は note 側（views/likes/shares/purchases/memo）と X 側（x:{…}）のグループ単位で扱う。
  //   含まれるグループだけ更新し、含まれないグループは残す（キー単位マージ・R-113）。null＝両方消す
  let reactionPatch: ReturnType<typeof normalizeReactionInput> | null = null;
  let reactionXPatch: ReturnType<typeof normalizeReactionXInput> | null = null;
  let noteProvided = false;
  let xProvided = false;
  if (hasReaction) {
    if (body.reaction !== null && (typeof body.reaction !== 'object' || Array.isArray(body.reaction))) return fail(400, 'reaction はオブジェクトか null で送ってください');
    const raw = (body.reaction ?? null) as Record<string, unknown> | null;
    if (raw === null) {
      noteProvided = true;
      xProvided = true;
      reactionPatch = { ok: true, reaction: null };
      reactionXPatch = { ok: true, x: null };
    } else {
      noteProvided = MANDALA_REACTION_KEYS.some((k) => k in raw) || 'memo' in raw;
      xProvided = 'x' in raw;
      if (!noteProvided && !xProvided) {
        noteProvided = true; // 空オブジェクト＝note 側を消す（308 の互換）
      }
      if (noteProvided) {
        const noteRaw: Record<string, unknown> = { ...raw };
        delete noteRaw.x;
        reactionPatch = normalizeReactionInput(noteRaw);
        if (!reactionPatch.ok) return fail(400, reactionPatch.error);
      }
      if (xProvided) {
        if (raw.x !== null && (typeof raw.x !== 'object' || Array.isArray(raw.x))) return fail(400, 'reaction.x はオブジェクトか null で送ってください');
        reactionXPatch = normalizeReactionXInput((raw.x ?? null) as Record<string, unknown> | null);
        if (!reactionXPatch.ok) return fail(400, reactionXPatch.error);
      }
    }
  }
  // 311: research＝{kind} で発注の印を付ける（進行中なら 409）／null で消す（失敗・中断の印を消す）
  const hasResearch = body.research !== undefined;
  if (hasResearch && body.research !== null) {
    const r = body.research as { kind?: unknown } | null;
    if (!r || typeof r !== 'object' || !isMandalaResearchKind(r.kind)) return fail(400, 'research は {kind} か null で送ってください');
  }
  if (!hasText && !hasTier && !hasReaction && !hasResearch) return fail(400, '更新する項目がありません');

  try {
    let cell: MandalaCell | null = null;
    let unchanged = true;
    if (hasText) {
      const result = await saveCell(guard.userId, cellId, { title: body.title, body: body.body });
      if (!result.ok) return fail(404, 'マスが見つかりません');
      cell = result.cell;
      unchanged = unchanged && result.unchanged;
    }
    if (hasTier || hasReaction) {
      const result = await updateCellMeta(guard.userId, cellId, {
        ...(hasTier ? { tier: body.tier as 'free' | 'paid' } : {}),
        ...(noteProvided && reactionPatch && reactionPatch.ok ? { reaction: reactionPatch.reaction } : {}),
        ...(xProvided && reactionXPatch && reactionXPatch.ok ? { reactionX: reactionXPatch.x } : {}),
      });
      if (!result.ok) return fail(404, 'マスが見つかりません');
      cell = result.cell;
      unchanged = unchanged && result.unchanged;
    }
    if (hasResearch) {
      if (body.research === null) {
        const result = await updateCellMeta(guard.userId, cellId, { research: null });
        if (!result.ok) return fail(404, 'マスが見つかりません');
        cell = result.cell;
        unchanged = unchanged && result.unchanged;
      } else {
        const result = await startResearch(guard.userId, cellId, (body.research as { kind: 'deepresearch' | 'text_analysis' }).kind);
        if (!result.ok) return fail(result.reason === 'not_found' ? 404 : result.reason === 'running' ? 409 : 400, result.message);
        cell = result.cell;
        unchanged = false;
      }
    }
    return NextResponse.json({ success: true, cell, unchanged });
  } catch (e: unknown) {
    console.error('[mandala] マスの保存に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, 'マスの保存に失敗しました');
  }
}
