// 297: 🎯用途カテゴリ API（📚リサーチ保存・🗂テキスト分析・🧠AI参照素材の3画面で共用・体系は1つ）。
//
// GET    ?scope=...                         一覧（件数つき。count=その画面の種別、count_total=3画面合計）
// POST   {name}                             作成
// PATCH  {action:'rename', id, name}        名前の変更（所属はそのまま）
// PATCH  {action:'assign', scope, itemId, categoryIds}  記事の所属を置き換える（追加・変更・全解除を1本で）
// DELETE ?id=                               削除（記事は消えず所属だけ外れる＝CASCADE）
//
// マイフォルダ API（/api/custom-folders）とは別体系・別テーブル。マイフォルダの実装には触れない（§6）。

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import {
  MAX_PURPOSES,
  MAX_PURPOSE_NAME_LENGTH,
  ensurePurposeTables,
  isItemScope,
  isPurposeUniqueViolation,
  listPurposesWithCounts,
  normalizePurposeName,
  setItemPurposes,
} from '@/lib/purpose-categories';

export const runtime = 'nodejs';

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  if (!session) return null;
  const userId = (session.user as { id?: string })?.id ?? '';
  return userId || null;
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scope = new URL(req.url).searchParams.get('scope');
  if (!isItemScope(scope)) return NextResponse.json({ error: 'scope が不正です' }, { status: 400 });
  try {
    await ensurePurposeTables();
    const categories = await listPurposesWithCounts(userId, scope);
    return NextResponse.json({ categories });
  } catch (e) {
    const message = e instanceof Error ? e.message : '取得に失敗しました';
    console.error('[purpose-categories GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const name = normalizePurposeName(body?.name);
    if (!name) {
      return NextResponse.json({ error: `カテゴリ名は1〜${MAX_PURPOSE_NAME_LENGTH}文字で入力してください` }, { status: 400 });
    }
    await ensurePurposeTables();
    const countRows = (await sql`SELECT COUNT(*)::int AS n FROM purpose_categories WHERE user_id = ${userId}`) as { n: number }[];
    if (Number(countRows[0]?.n ?? 0) >= MAX_PURPOSES) {
      return NextResponse.json({ error: `用途カテゴリは${MAX_PURPOSES}個までです` }, { status: 400 });
    }
    const rows = (await sql`
      INSERT INTO purpose_categories (user_id, name, sort_order)
      VALUES (${userId}, ${name},
              COALESCE((SELECT MAX(sort_order) + 1 FROM purpose_categories WHERE user_id = ${userId}), 0))
      RETURNING id, name, sort_order
    `) as { id: number; name: string; sort_order: number }[];
    const c = rows[0];
    return NextResponse.json({ ok: true, category: { id: Number(c.id), name: c.name, sort_order: Number(c.sort_order), count: 0, count_total: 0 } });
  } catch (e) {
    if (isPurposeUniqueViolation(e)) {
      return NextResponse.json({ error: '同じ名前の用途カテゴリがあります' }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : '作成に失敗しました';
    console.error('[purpose-categories POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const action = body?.action;
    await ensurePurposeTables();

    if (action === 'rename') {
      const id = Number(body?.id);
      const name = normalizePurposeName(body?.name);
      if (!Number.isFinite(id)) return NextResponse.json({ error: 'id が不正です' }, { status: 400 });
      if (!name) {
        return NextResponse.json({ error: `カテゴリ名は1〜${MAX_PURPOSE_NAME_LENGTH}文字で入力してください` }, { status: 400 });
      }
      const rows = (await sql`
        UPDATE purpose_categories SET name = ${name}
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, name, sort_order
      `) as { id: number; name: string }[];
      if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ ok: true, category: rows[0] });
    }

    if (action === 'assign') {
      const scope = body?.scope;
      if (!isItemScope(scope)) return NextResponse.json({ error: 'scope が不正です' }, { status: 400 });
      const itemKey = body?.itemId === undefined || body?.itemId === null ? '' : String(body.itemId).trim();
      if (!itemKey) return NextResponse.json({ error: 'itemId が不正です' }, { status: 400 });
      const categoryIds: number[] = Array.isArray(body?.categoryIds) ? body.categoryIds : [];
      // 他人の記事に用途を付けられないよう、記事側の所有者を先に検証する（マイフォルダと同じ）
      const owned =
        scope === 'text_analysis'
          ? ((await sql`SELECT 1 FROM text_analysis_saves WHERE id::text = ${itemKey} AND user_id = ${userId}`) as unknown[])
          : scope === 'library'
            ? ((await sql`SELECT 1 FROM library WHERE id::text = ${itemKey} AND user_id = ${userId}`) as unknown[])
            : ((await sql`SELECT 1 FROM context_saves WHERE id::text = ${itemKey} AND user_id = ${userId}`) as unknown[]);
      if (owned.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      await setItemPurposes(userId, scope, itemKey, categoryIds);
      const categories = await listPurposesWithCounts(userId, scope);
      return NextResponse.json({ ok: true, categories });
    }

    return NextResponse.json({ error: '不正なactionです' }, { status: 400 });
  } catch (e) {
    if (isPurposeUniqueViolation(e)) {
      return NextResponse.json({ error: '同じ名前の用途カテゴリがあります' }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : '更新に失敗しました';
    console.error('[purpose-categories PATCH]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id が不正です' }, { status: 400 });
  try {
    await ensurePurposeTables();
    // 記事は消えない: 所属は ON DELETE CASCADE で外れるだけ
    const rows = (await sql`
      DELETE FROM purpose_categories WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `) as { id: number }[];
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '削除に失敗しました';
    console.error('[purpose-categories DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
