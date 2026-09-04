import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { neon } from '@neondatabase/serverless';
import { sanitizeForDb } from '@/lib/sanitize';
// 252: マイフォルダ（🗂保存一覧と共有する 'stock' 体系）
import {
  detachItemFromFolders,
  detachItemsFromFolders,
  ensureCustomFolderTables,
  getFolderIdsForItems,
} from '@/lib/custom-folders';
// 297: 🎯用途カテゴリ（マイフォルダとは別テーブル・別体系）
import { detachItemFromPurposes, detachItemsFromPurposes, ensurePurposeTables, getPurposeIdsForItems } from '@/lib/purpose-categories';
import { hasSavableContent } from '@/lib/merge-report';

// 250: 一括削除の1リクエストあたりの上限（text-analysis / context-saves と同値）。
const BULK_DELETE_LIMIT = 500;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  const q = req.nextUrl.searchParams.get('q')?.trim();
  // type フィルタ（任意）。指定があれば type=xxx で絞り込み、なければ従来通り全件
  const typeFilter = req.nextUrl.searchParams.get('type')?.trim();

  if (q) {
    const rows = typeFilter
      ? await sql`
        SELECT *, CASE
          WHEN title ILIKE ${'%' + q + '%'} THEN 1
          WHEN content ILIKE ${'%' + q + '%'} THEN 2
          ELSE 3
        END as relevance
        FROM library
        WHERE user_id = ${userId}
          AND type = ${typeFilter}
          AND (title ILIKE ${'%' + q + '%'} OR content ILIKE ${'%' + q + '%'})
        ORDER BY relevance ASC, created_at DESC
        LIMIT 50
      `
      : await sql`
        SELECT *, CASE
          WHEN title ILIKE ${'%' + q + '%'} THEN 1
          WHEN content ILIKE ${'%' + q + '%'} THEN 2
          ELSE 3
        END as relevance
        FROM library
        WHERE user_id = ${userId}
          AND (title ILIKE ${'%' + q + '%'} OR content ILIKE ${'%' + q + '%'})
        ORDER BY relevance ASC, created_at DESC
        LIMIT 50
      `;
    return NextResponse.json(await withCustomFolders(userId, rows));
  }

  const rows = typeFilter
    ? await sql`SELECT * FROM library WHERE user_id = ${userId} AND type = ${typeFilter} ORDER BY is_favorite DESC, created_at DESC`
    : await sql`SELECT * FROM library WHERE user_id = ${userId} ORDER BY is_favorite DESC, created_at DESC`;
  return NextResponse.json(await withCustomFolders(userId, rows));
}

// 252: 所属マイフォルダを付与する（本体クエリは変えず別クエリで足す）。
// ここが失敗しても一覧そのものは返す＝付加情報の欠落で本体を壊さない（R-39）。
// library は全件返す設計だが、対象は分類済みの行だけなので1クエリで足りる。
type LibraryRow = Record<string, unknown> & { id?: unknown };
async function withCustomFolders(
  userId: string,
  rows: Record<string, unknown>[],
): Promise<LibraryRow[]> {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  try {
    await ensureCustomFolderTables();
    const map = await getFolderIdsForItems(userId, 'library', rows.map((r) => String(r.id)));
    // 297: 所属用途カテゴリIDも同じ流儀で付与（別テーブル。失敗しても一覧は出す）
    let purposeMap: Record<string, number[]> = {};
    try {
      await ensurePurposeTables();
      purposeMap = await getPurposeIdsForItems(userId, 'library', rows.map((r) => String(r.id)));
    } catch (e) {
      console.error('[library GET purposes]', e);
    }
    return rows.map((r) => ({ ...r, custom_folder_ids: map[String(r.id)] ?? [], purpose_category_ids: purposeMap[String(r.id)] ?? [] }));
  } catch (e) {
    console.error('[library GET custom folders]', e);
    return rows.map((r) => ({ ...r, custom_folder_ids: [], purpose_category_ids: [] }));
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { type, title, content, metadata, tags, group_name, is_favorite, folder_name } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  const userId = (session.user as any).id;

  // 237: NUL文字・孤立サロゲートが混ざると INSERT が例外になり、本文まるごとが保存できなくなる。
  // 表示上ほぼ意味を持たない不可視文字だけを落として、保存は必ず通す（R-39）。
  const safeTitle = sanitizeForDb(title);
  const safeContent = sanitizeForDb(content);

  // 287 §3-4: 本文が空なら保存しない（fail-closed）。「(無題) 0文字」の行をDBに作らず、失敗として返す
  if (!hasSavableContent(safeContent)) {
    return NextResponse.json({ error: '本文が空のため保存しませんでした' }, { status: 400 });
  }

  try {
    await sql`INSERT INTO library (id, user_id, type, title, content, metadata, tags, group_name, is_favorite, folder_name)
      VALUES (${id}, ${userId}, ${type}, ${safeTitle}, ${safeContent}, ${JSON.stringify(metadata || {})}, ${sanitizeForDb(tags)}, ${group_name || '未分類'}, ${is_favorite ? 1 : 0}, ${folder_name || null})`;
  } catch (error: unknown) {
    // 237: 原因の分からない500を返さない（234 R-33 と同じ方針）
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[library POST] insert failed:', message);
    return NextResponse.json({ error: `保存できませんでした: ${message}` }, { status: 500 });
  }

  // ライブラリ保存後に通知作成（非同期・ノンブロッキング）
  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  fetch(`${baseUrl}/api/notifications/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
    body: JSON.stringify({
      title: '📚 リサーチ保存に追加しました',
      message: title ?? '',
      type: 'success',
      href: '/dashboard/library',
    }),
  }).catch(() => {});

  // ライブラリ保存後に非同期でメモリ化（レスポンスを待たない）
  fetch(`${baseUrl}/api/memory/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
    body: JSON.stringify({
      content: content || '',
      title: title ?? '',
      sourceType: group_name ?? 'library',
      category: group_name ?? 'general',
    }),
  }).catch(() => {}); // エラーは無視

  return NextResponse.json({ success: true, id });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, is_favorite, tags, group_name, title, folder_name, content, metadata } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  if (is_favorite !== undefined) {
    await sql`UPDATE library SET is_favorite = ${is_favorite} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (tags !== undefined) {
    await sql`UPDATE library SET tags = ${tags} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (group_name !== undefined) {
    await sql`UPDATE library SET group_name = ${group_name} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (title !== undefined) {
    await sql`UPDATE library SET title = ${title} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (folder_name !== undefined) {
    await sql`UPDATE library SET folder_name = ${folder_name} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (content !== undefined) {
    await sql`UPDATE library SET content = ${content} WHERE id = ${id} AND user_id = ${userId}`;
  }
  if (metadata !== undefined) {
    await sql`UPDATE library SET metadata = ${JSON.stringify(metadata)} WHERE id = ${id} AND user_id = ${userId}`;
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, ids } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;

  // 250: 選択中をまとめて削除（owner検証つき）。単体削除の { id } は従来どおり動く。
  // id の型に依存しないよう ::text で比較する。削除は不可逆なので確認はUI側で必須にしている。
  if (Array.isArray(ids)) {
    const idsArray = ids.map((v: unknown) => String(v)).filter(Boolean).slice(0, BULK_DELETE_LIMIT);
    if (idsArray.length === 0) {
      return NextResponse.json({ error: 'ids が空です' }, { status: 400 });
    }
    const deleted = await sql`
      DELETE FROM library
      WHERE id::text = ANY(${idsArray}) AND user_id = ${userId}
      RETURNING id
    `;
    // 252: 分類（マイフォルダ）も外す。掃除の失敗で削除自体を失敗させない
    await detachItemsFromFolders(userId, 'library', idsArray).catch((e) =>
      console.error('[library bulk_delete detach]', e),
    );
    await detachItemsFromPurposes(userId, 'library', idsArray).catch((e) =>
      console.error('[library bulk_delete detach purposes]', e),
    );
    return NextResponse.json({ success: true, deleted: deleted.length });
  }

  if (!id) return NextResponse.json({ error: 'id が必須です' }, { status: 400 });
  await sql`DELETE FROM library WHERE id = ${id} AND user_id = ${userId}`;
  // 252: 分類（マイフォルダ）も外す。掃除の失敗で削除自体を失敗させない
  await detachItemFromFolders(userId, 'library', String(id)).catch((e) =>
    console.error('[library DELETE detach]', e),
  );
  await detachItemFromPurposes(userId, 'library', String(id)).catch((e) =>
    console.error('[library DELETE detach purposes]', e),
  );
  return NextResponse.json({ success: true, deleted: 1 });
}
